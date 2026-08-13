# Feature Plan: P13 — Private, authorized progress-photo access

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved) — security follow-up to P3/P12.
**Plan ID:** P13
**Slug:** private-authorized-photos
**Author:** Claude (Opus)
**Date:** 2026-08-13
**Status:** Complete

> **No GitHub issue.** Standalone security follow-up inside the approved epic, driven by a live-prod
> requirement raised this session (body photos must not be world-readable). No epic §9 brief for it.
> **No automated tests** (epic §3). Manual verification only (§5).
> **Baseline:** P12 shipped to prod (`blob.py` already at `_API_VERSION = "12"`, `BlobUploadError`, HTTP-body
> logging; client downscale in `MeasurementForm`). P13 builds on that tree.

---

## 1. Goal & root cause

Progress photos are pictures of people's bodies — they must **not** be world-readable. P3 stored them as
Vercel Blob **public** URLs served directly to `<img src>` with no proxy (DEPLOY.md:70) — "unguessable random
suffix" is security-by-obscurity: a leaked URL (share, history, logs, `Referer`) grants permanent,
unauthenticated, un-revocable access.

The live Blob store `progresso-image-bank` is a **private** store (`Access: Private`, base
`k5dkv1dtfkzmi5os.private.blob.vercel-storage.com`) — Vercel's new default. Two consequences:

1. **Upload fails** (the P12 symptom, now unmasked): the raw PUT in `blob.py` sends no access header, so the
   API defaults to *public* and a private store rejects it:
   `HTTP 400 bad_request: "Cannot use public access on a private store."` (confirmed in prod logs).
2. **Serving** a private blob requires an **authenticated** request (Bearer token); the public URL 403s.

**Decision: keep the store private and gate every photo read through the existing `can_access` predicate.**
This is *more* aligned with the epic's one-authorization-predicate rule than P3's public-URL design.

---

## 2. Acceptance criteria

- **AC-1** Photo upload succeeds on the live app (private store): `blob.put` marks the blob private via
  `x-vercel-blob-access: private`. — ✅ `core/services/blob.py:66` (header added to the PUT).
- **AC-2** A progress photo is retrievable **only** by users who pass `can_access` for the owning trainee —
  i.e. the owner trainee and their trainer. An unauthenticated request, or a stranger, gets 403/404 (no
  existence leak). No inline `if role ==` check anywhere; access flows through
  `MeasurementAccessPermission` + `accessible_data_filter` exactly like measurement rows. — ✅
  `core/api/views.py:231` (`photo_file`/`thumbnail_file` → `get_object()` runs `get_queryset`'s
  `accessible_data_filter` (`views.py:183`) + `MeasurementAccessPermission.has_object_permission`
  → `can_access(obj.user)`, `permissions.py:120`). Live matrix: owner 200, owning trainer 200, unrelated
  trainer 404, stranger 404, unauth 403.
- **AC-3** The raw private Blob URL is **never** exposed in any API payload. The measurement/feed JSON carries
  same-origin proxy URLs (`/api/v1/measurements/<id>/photo`, `.../thumbnail`) instead. — ✅
  `core/api/serializers.py:290` (`photo_url`/`thumbnail_url` `SerializerMethodField`s →
  `_proxy_url`, `serializers.py:373`); export path threads `request` context (`views.py:444`). Live: no
  `blob.vercel-storage.com` in the measurement payload **or** `/me/export`.
- **AC-4** Front-end renders unchanged: `<img src>` points at the proxy endpoint; the session cookie
  authenticates the image request automatically. — ✅ No FE change; `frontend/src/lib/measurements.ts:23`
  fields keep their names; `<img src>` bindings unchanged (`MeasurementCard.tsx:24`, `PhotoCompare.tsx:51`).
- **AC-5** Carried invariants: no raw SQL; `from __future__ import annotations`; strict types; error bodies
  are i18n keys; `manage.py check` + `makemigrations --check` clean; `tsc` + `npm run build` clean. — ✅
  `manage.py check` → "no issues"; `makemigrations --check` → "No changes detected"; `npm run build` → built.
- **AC-6** **No DB migration** — `photo_url`/`thumbnail_url` remain `URLField`s; they now hold the private
  blob URL (server-side only), and the API surfaces proxy URLs computed from them. — ✅
  `core/models/measurement.py:136` (unchanged `URLField`s; doc-comment updated); no migration generated.

---

## 3. Design / approach

**Serve model chosen: proxy-stream** (Django fetches the private blob with the RW token and streams the bytes
back), not signed-URL redirect:

- No new dependency — fits `blob.py`'s stdlib-`urllib`, no-`@vercel/blob` design.
- `can_access` is re-checked on **every** view (no signed-URL TTL leak window).
- Photos are downscaled client-side to <1 MB (P12) — comfortably under Vercel's 4.5 MB *response* limit;
  thumbnails are tiny.
- Session-cookie auth means `<img src="/api/v1/…">` just works; no JS fetch/blob-URL dance.

### 3.1 Blob client (`core/services/blob.py`)
- `put`: add header `"x-vercel-blob-access": "private"` (the SDK's `x-vercel-blob-access` header;
  `put-helpers.ts:110`). Fixes AC-1.
- New `get_bytes(url: str) -> bytes`: token set → authenticated `GET url` with `Authorization: Bearer` +
  `x-api-version`, return the body; token unset (dev) → read from `FileSystemStorage` (strip `MEDIA_URL`
  prefix). Wrap HTTP/URL errors in `BlobUploadError` + `logger`.
- (Keep the P12 hardening: `_API_VERSION = "12"`, `BlobUploadError`, response-body logging.)

### 3.2 Serve endpoints (`core/api/views.py` + `urls.py`)
- Two detail methods on `MeasurementViewSet`: `photo_file` and `thumbnail_file`. Each calls
  `self.get_object()` (→ `get_queryset` already filters to `accessible_data_filter`, and
  `check_object_permissions` runs `MeasurementAccessPermission.has_object_permission` → `can_access(obj.user)`
  for SAFE methods), then `blob.get_bytes(instance.photo_url|thumbnail_url)` and returns a plain
  `HttpResponse(data, content_type="image/jpeg")` (photos are always JPEG-normalized by `photos.py`) with
  `Cache-Control: private, max-age=3600` (Q2 — immutable once uploaded). Empty URL → `Http404`.
- `urls.py`: add, **after** the literal `photos`/`series` and the `<int:pk>` detail routes:
  - `measurements/<int:pk>/photo` → `as_view({"get": "photo_file"})`, name `measurement-photo`.
  - `measurements/<int:pk>/thumbnail` → `as_view({"get": "thumbnail_file"})`, name `measurement-thumbnail`.
  These bypass DRF renderers by returning a Django `HttpResponse` directly (allowed from a viewset method).

### 3.3 Serializer (`core/api/serializers.py`)
- Replace the auto-mapped `photo_url`/`thumbnail_url` model fields with two `SerializerMethodField`s of the
  **same output names** (so the SPA is untouched):
  - `get_photo_url(obj)` → `None` if `obj.photo_url == ""`, else
    `reverse("measurement-photo", args=[obj.pk], request=self.context["request"])` (absolute, same-origin).
  - `get_thumbnail_url` analogous.
- Remove `photo_url`/`thumbnail_url` from `read_only_fields` (explicit `SerializerMethodField`s can't also be
  listed there); keep them in `fields`. The write-only `photo` upload field is unchanged.

### 3.4 Front-end
- **No change.** `photo_url`/`thumbnail_url` keep their names and now resolve to the proxy endpoint;
  `PhotoCompare` / measurement detail already bind `<img src>` to them, and image GETs carry the session
  cookie.

### 3.5 Infra (one-time, prod)
- The store is already private — **no store recreation** (unlike the discarded "go public" option). Once the
  private-upload header ships and is deployed, uploads work against the existing store. No token change, no
  data migration (store has 0 files).

---

## 4. Out of scope
- Signed-URL redirect variant (documented alternative; revisit only if proxy bandwidth/latency ever bites).
- Vercel Blob **client uploads** (browser→Blob direct); server stays the sole writer.
- Response caching / CDN in front of the proxy (photos are private; add a short private `Cache-Control` later
  if needed).
- Changing the P12 client downscale (still required — keeps the request under 4.5 MB *and* the response small).

---

## 5. Verification (manual)
1. `python manage.py check` + `makemigrations --check` — clean, **no migration**.
2. `cd frontend && npm run build` — clean; confirm no front-end change was needed.
3. **Local blob round-trip** (with the real prod token, `vercel env pull`): `blob.put(...private...)` returns a
   `...private.blob.vercel-storage.com` URL; `blob.get_bytes(that_url)` returns the exact bytes. Delete the
   test blob after.
4. **Dev (no token):** upload a photo via `runserver`; the proxy endpoint streams it from `media/`.
5. **Prod:** deploy; as a trainee upload a photo → it renders. As that trainee's **trainer**, open compare →
   photos render. As an unrelated user, hit `/api/v1/measurements/<id>/photo` → 403/404. Logged-out → 403.
6. Confirm no API payload contains a `blob.vercel-storage.com` URL (grep the network response).

---

## 6. File plan

| Layer | File | Change |
|---|---|---|
| Backend / blob | `core/services/blob.py` | `put`: `x-vercel-blob-access: private`. New `get_bytes(url)` (auth GET / dev FS read). |
| Backend / api | `core/api/views.py` | `photo_file` + `thumbnail_file` detail methods streaming via `blob.get_bytes`. |
| Backend / api | `core/api/urls.py` | Two named routes: `measurement-photo`, `measurement-thumbnail`. |
| Backend / api | `core/api/serializers.py` | `photo_url`/`thumbnail_url` → `SerializerMethodField` returning proxy URLs; drop from `read_only_fields`. |
| Model | `core/models/measurement.py` | Doc-comment only: fields now hold the **private** blob URL, surfaced via proxy. No schema change. |
| Front-end | — | None. |

---

## 8. Open questions — RESOLVED (developer, 2026-08-13)

- **Q1 — Serve mechanism → PROXY-STREAM.** ✅
- **Q2 — Proxy cache headers → `Cache-Control: private, max-age=3600`.** ✅
- **Q3 — API field shape → keep `photo_url`/`thumbnail_url` names (zero front-end change).** ✅
- **Q4 — Store → keep existing private `progresso-image-bank`; no recreation.** ✅

Original detail retained below.

- **Q1 — Serve mechanism.** **PROPOSAL: proxy-stream.** Django re-checks `can_access` on every image
  request and streams the private bytes. Alternative (signed-URL redirect) is *uncertain* here: the
  stdlib-`urllib` client has no `@vercel/blob` SDK, and Vercel's documented private-serve path is the
  streaming `get()` (proxy); minting a standalone signed link from raw HTTP is not clearly supported without
  the SDK, which the epic bans as a dependency (Q5). Proxy also has no TTL leak window. Cost: bytes flow
  through the function, but downscaled photos are <1 MB (well under the 4.5 MB response cap).
  **Accept proxy, or do you want me to spike SDK-based signed redirects instead?**
- **Q2 — Proxy cache headers.** **PROPOSAL: `Cache-Control: private, max-age=3600`.** A measurement's photo is
  immutable once uploaded, so an hour of browser-private caching cuts repeat function invocations (compare view
  re-renders) with no staleness risk. Alternative: `no-store` (max secrecy, every view re-authorizes, higher
  function load). **`private, max-age=3600`, or `no-store`?**
- **Q3 — API field shape.** **PROPOSAL: keep `photo_url`/`thumbnail_url` names**, now resolving to the proxy
  endpoint → **zero front-end change**. Alternative: rename to `photo`/`thumbnail` (cleaner semantics, but
  touches `PhotoCompare` + measurement views + i18n for no functional gain). **Keep names, or rename?**
- **Q4 — Store.** The existing private store `progresso-image-bank` (0 files) is kept as-is; no recreation, no
  token change, no data migration. Flagging only for confirmation — **any reason to provision a fresh store
  instead?** (**PROPOSAL: keep it.**)

## 9. Migration answer (for the record)
The `photo_upload_failed` seen in prod was **not** a missing migration — it was the private-store 400. P13
adds **no** migration: the two URL columns are unchanged; only what they contain (private URL) and how the API
exposes them (proxy) changes.

## 13. Post-implementation

**Built.** Private-store upload fix + authenticated proxy read for progress photos, gated by the existing
`can_access` predicate — zero new dependency, zero migration, zero front-end change.

- `blob.put` now sends `x-vercel-blob-access: private` (fixes the prod 400). New `blob.get_bytes(url)`:
  token set → authenticated `GET` (Bearer + `x-api-version`); token unset (dev) → `MEDIA_ROOT` read via
  `FileSystemStorage`, both wrapped in `BlobUploadError`.
- `MeasurementViewSet.photo_file` / `thumbnail_file` detail methods stream the bytes as a plain
  `HttpResponse(content_type="image/jpeg", Cache-Control: private, max-age=3600)`; `get_object()` runs the
  full `can_access` gate; empty URL → `Http404`. Two named routes (`measurement-photo`,
  `measurement-thumbnail`).
- `MeasurementSerializer.photo_url` / `thumbnail_url` became `SerializerMethodField`s (same output names)
  returning the same-origin proxy URL (or `None` for a photo-less row); dropped from `read_only_fields`.

**Deviation from §6 (surfaced):** the plan's file list omitted `MeExportView`. It builds `MeasurementSerializer`
directly *without* request context, so `/me/export` would otherwise have emitted a relative URL — and, pre-fix,
the raw private Blob URL. Threaded `context={"request": request}` there (`views.py:444`) so the export payload
also carries absolute proxy URLs and never leaks the store URL (required by AC-3). `_proxy_url` still tolerates
a missing request context (relative fallback) as a safety net.

**Verification.** `manage.py check` + `makemigrations --check` clean (no migration); `npm run build` clean.
Dev FS `put`→`get_bytes` round-trip returns exact bytes. Live server access matrix (session-cookie auth):
owner trainee **200**, owning trainer **200**, unrelated trainer **404**, stranger trainee **404**,
unauthenticated **403**; measurement payload and `/me/export` contain **no** `blob.vercel-storage.com` URL;
proxy response is `image/jpeg` with `Cache-Control: private, max-age=3600`.

**Follow-ups for the developer.**
- **Prod deploy is the real AC-1 test.** Local dev has no `BLOB_READ_WRITE_TOKEN`, so the private-store PUT
  header was verified by code inspection, not a live upload. After deploy, upload one photo end-to-end (§5.5).
- Response bandwidth flows through the serverless function (proxy, not redirect) — fine for the P12
  sub-1 MB downscaled photos; revisit signed-URL redirects only if latency/bandwidth ever bites (§4).
- Local `db.sqlite3` now holds a few throwaway verification users/measurements (gitignored dev DB only).
