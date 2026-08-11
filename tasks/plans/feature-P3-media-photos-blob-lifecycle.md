# Feature Plan: P3 — Media, Photos & Blob Lifecycle

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved)
**Plan ID:** P3
**Slug:** media-photos-blob-lifecycle
**Author:** Claude (Opus)
**Date:** 2026-08-11
**Status:** Complete (implemented + manually verified 2026-08-11; all §11 open questions accepted as proposed)

> No GitHub issue. ACs are quoted from the design docs (`tasks/design/*.md`) via the epic §9 P3 brief.
> P1 shipped the DRF scaffold + `CustomUser`/`can_access`; P2 shipped the `Measurement` model + CRUD API
> (numeric JSON only). P3 hangs the **progress photo** off that same model: upload to Vercel Blob, a
> thumbnail generated on save, and blob delete-on-delete so storage never leaks.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7.

> **Scope note — the Blob backend must be built, not "reused."** The design docs say "reuse the Vercel
> Blob backend nearly as-is" (`rebuild-analysis.md` §8, §2 comment). That refers to the *pre-rebuild*
> codebase. This repo is greenfield: there is **no** `blob*`/`storage*` module, **no** Pillow, and **no**
> `STORAGES`/`MEDIA` config today (verified: `git ls-files`, grep of `progresso/settings/`, `requirements.txt`).
> P3 therefore *writes* the Blob client fresh, modelled on the design's description of the old one
> ("clean, dependency-free, correctly lazy on the token" — `rebuild-analysis.md` §2). "Reuse" = adopt the
> same shape, not import existing code.

---

## 1. Goal

Give a `Measurement` a **progress photo** and manage its lifecycle end-to-end:

- **Upload on create/update:** `POST /api/v1/measurements` accepts multipart (the P2 numeric fields **plus**
  a `photo` file). The image is validated, a **thumbnail is generated on save** (Pillow), and both original
  and thumbnail are uploaded to **Vercel Blob**; the returned public URLs are stored on the measurement and
  echoed in every payload (no proxy endpoint — bytes served straight from the Blob public URL).
- **Delete-on-delete:** deleting a measurement (or cascade-deleting its owning trainee) removes both blobs.
  This closes the known leak — *"Blob delete never wired to measurement deletion. Orphaned blobs → storage
  leak + cost"* (`rebuild-analysis.md` §2 #9).
- **Compare picker feed:** `GET /api/v1/measurements/photos?user=:id` lists the measurements that have a
  photo (id, dates, photo + thumbnail URLs) for the P7 compare UI — same `can_access` gate as the rest.

P3 is **backend only**. The capture form (P6) and the side-by-side/overlay compare UI (P7) consume these
endpoints but are out of scope here.

The `Measurement` model file is shared across P2/P3/P4 (P2 docstring already reserves P3's photo fields).
P3 adds the photo/thumbnail fields + upload/cleanup wiring and must leave P4's `bmi`/series additions
untouched.

---

## 2. Acceptance criteria (quoted from design docs via epic §9 P3 brief)

| AC | Covered by (file:line evidence) |
|----|----------------------|
| AC-1 photo upload to Blob + thumbnail generation + delete-on-delete lifecycle | `core/models/measurement.py:130-131` (URL fields); `core/services/photos.py:37-73` (upload+thumb); `core/services/blob_cleanup.py:48-49` (post_delete). Verified §7 steps 2,5,7,9 (33/35 driver PASS; 2 fails were bad test data — size cap re-verified at 17 MB → `photo_too_large`) |
| AC-2 thumbnail generated on save | `core/services/photos.py:65-73` (`thumbnail()` + two `blob.put`); `core/api/serializers.py:253-274` (create/update call `_process_photo`). Verified §7 step 2 (thumb ≤400px) |
| AC-3 blob delete wired to measurement delete **and** trainee-cascade delete | `core/services/blob_cleanup.py:43-49` (`delete_photo_blobs` + `@receiver(post_delete)`); `core/apps.py:11-13` (`ready()` wires it). Verified §7 steps 7 (direct) + 9 (cascade on user delete) |
| AC-4 Vercel Blob backend (built fresh, same shape) + thumbnail + delete | `core/services/blob.py:33-102` (`put`/`delete`, lazy `_token`, FS fallback). Verified §7 all steps (fallback mode) |
| AC-5 `GET /measurements/photos?user=:id` compare feed via `can_access`, public URLs, no proxy | `core/api/views.py:138-158` (`photos` action, `exclude(photo_url="")`); `core/api/urls.py:24,36` (route before pk). Verified §7 step 6 (feed + 403 matrix); no proxy view (grep §7 step 11) |
| AC-6 `POST` accepts multipart numbers + photo; public URLs in every measurement payload | `core/api/serializers.py:122-150` (`photo` write field + `photo_url`/`thumbnail_url` read fields); `core/api/views.py:108` (`parser_classes`). Verified §7 steps 2,3 |

- **AC-1** "Photo upload to Blob + thumbnail generation + delete-on-delete lifecycle." (`rebuild-analysis.md`
  §6 B2)
- **AC-2** "Photo → generate a thumbnail on save." (`rebuild-analysis.md` §5 Measurement)
- **AC-3** "**Blob delete never wired** to measurement deletion. Orphaned blobs → storage leak + cost." —
  fixed (`rebuild-analysis.md` §2 #9). Also covers the trainee cascade: *"remove trainee (cascades; cleans
  blobs)"* (`mvp-routes.md` §B Users, line 80).
- **AC-4** "Reuse the Vercel Blob backend nearly as-is; add thumbnail + delete." (`rebuild-analysis.md` §8)
  — built fresh here (see scope note above), same dependency-free, lazy-token shape.
- **AC-5** `GET /api/v1/measurements/photos?user=:id` — *"measurements that have a photo, for the compare
  picker"*, allowed for *"owner or trainer(owns)"*, resolved through `can_access`; *"Photo bytes served from
  Blob public URL returned in the measurement payload — no proxy endpoint needed in MVP."* (`mvp-routes.md`
  §B Photos, lines 95, 97)
- **AC-6** `POST /api/v1/measurements` — *"create own (multipart: numbers + photo)"* (`mvp-routes.md` §B
  Measurements, line 86). The response (and every measurement payload) carries the photo + thumbnail public
  URLs. `DELETE .../:id` — *"delete own (removes blob)"* (line 89).

### Permission matrix — manual verification checklist (epic §5; no automated tests)

The photo endpoints inherit the P2 measurements matrix — access resolves through the **same** `can_access`
predicate; nothing new about the trainer↔trainee rule is introduced. For
`{trainee, trainer(owns), other-trainer} × {own data, other's data}`:

| Caller | Target | `POST` w/ photo | `GET /photos?user=` | `DELETE :id` (blob removed) |
|--------|--------|-----------------|---------------------|-----------------------------|
| trainee | self | 201, URLs set | 200 (own w/ photo) | 204 + blobs gone |
| trainee | another user's | n/a (`user` forced self) | 403 | 403 |
| trainer | own trainee | **403** (create is trainee-only) | 200 | **403** (owner-only) |
| trainer | other trainer's trainee | 403 | 403 | 403 |
| admin | anyone | — | 200 | per owner rule |

Verified by hand in §7.

---

## 3. Out of scope (deferred — do not build in P3)

- **Compare UI** — side-by-side, overlay/slider, date-aligned, pose guide → P7 / post-MVP
  (`rebuild-analysis.md` §7 D1, §11; epic P3 brief "Out of scope"). P3 ships only the JSON feed the UI reads.
- **Capture form / camera UI** → P6 (`mvp-routes.md` `/me/measurements/new`).
- **`bmi` property, `measurements/series` chart endpoint, derived metrics** → P4.
- **`export/delete-my-data` privacy path** → P8 hardening (`rebuild-analysis.md` §7 Data lifecycle). P3
  only wires the automatic blob cleanup on measurement/trainee delete.
- **A proxy/streaming media endpoint** — explicitly *not* built; bytes come from the Blob public URL
  (`mvp-routes.md` §B Photos line 97).
- **Multiple photos / photo per body-angle / pose set** — MVP is one photo per measurement.
- **CDN/cache tuning, signed-URL expiry** — Blob's random-suffix public URL is the MVP privacy posture
  (`rebuild-analysis.md` §7 Security "secure media URLs (Blob random suffix already helps)"). Signed/expiring
  URLs are post-MVP.

---

## 4. Cross-cutting decisions this plan adopts (from epic §3, no re-litigating)

- **One authorization predicate.** The `photos` action and every photo-bearing payload resolve access
  through `request.user.can_access(target)` / `accessible_data_filter` exactly as P2 — no new trainer→trainee
  branch. `MeasurementAccessPermission` (P2) already covers the standard verbs; the `photos` action reuses it.
- **Thin views.** The viewset only wires querysets/permissions/parsers and the forced owner. All photo
  validation + thumbnail + upload orchestration lives in the serializer → service layer, never in the view.
- **Layered layout.** Blob HTTP client in `core/services/blob.py`; thumbnail + upload orchestration in
  `core/services/photos.py`; cleanup + signal in `core/services/blob_cleanup.py` (epic §3 names
  `blob_cleanup.py`; §deviation noted in §11 Q4). Model gains fields only; the `post_delete` receiver is
  wired in `core/apps.py`.
- **Host-agnostic / env-driven (epic Q5).** The Blob token comes from an env var
  (`BLOB_READ_WRITE_TOKEN`); nothing Vercel-specific leaks into app code beyond `blob.py`. A **local-dev
  fallback** (filesystem `MEDIA` storage when no token is set) keeps the app runnable without a Blob account
  — see §5.2 / §11 Q1.
- **No data files in git.** The dev-fallback `media/` dir stays gitignored (P1 already fixed `.gitignore`);
  no committed blobs.
- **Dependency-free Blob client** (design intent, `rebuild-analysis.md` §2). `blob.py` uses `urllib.request`
  from stdlib — no new HTTP dependency. The **only** new package is **Pillow** (thumbnails, epic Q3).
- **strict typing + PEP 8.** New modules open with `from __future__ import annotations`; full type hints.
- **No raw SQL.** ORM only; the `photos` feed is an ORM `.exclude(photo_url="")` filter.
- **i18n (epic Q6).** Every photo-validation error `detail` is a translation **key**
  (`invalid_image`, `photo_too_large`), never English prose — mirrors P2.

---

## 5. Design / approach

### 5.1 `core/models/measurement.py` — photo fields (edit; P3's reserved slot)

Add to `Measurement` (the P2 docstring already reserves "P3 — photo bytes + thumbnail fields + a save hook
+ blob delete-on-delete"):

- `photo_url` — `URLField(max_length=500, blank=True, default="")`. The Vercel Blob **public URL** of the
  full-size image. Stored, not proxied; empty string ⇒ no photo (keeps `exclude(photo_url="")` simple, avoids
  nullable-URL ambiguity).
- `thumbnail_url` — `URLField(max_length=500, blank=True, default="")`. Public URL of the generated
  thumbnail. Set together with `photo_url`.

Rationale for storing **URLs** (not a `pathname`/key): Vercel Blob's delete API takes the blob **URL**
directly, so the two URLs are sufficient for both serving and cleanup — no extra key column needed. The
random-suffix URL is also the MVP privacy measure (`rebuild-analysis.md` §7).

No `ImageField`/`FileField` on the model — Django file fields imply a `DEFAULT_FILE_STORAGE` round-trip and a
committed `media/` path; here the bytes live in Blob and the model holds only the resulting URLs. The upload
`photo` is a **write-only serializer field** (§5.4), not a model field.

Do **not** add a model `save()` override for upload (network I/O in `save()` is a footgun and violates thin
model intent). "Thumbnail on save" (AC-2) is satisfied at the **serializer create/update** boundary via the
service (§5.3/5.4). The **delete** side *does* use a signal (§5.5) because cascade deletes bypass instance
`delete()`.

### 5.2 `core/services/blob.py` — Vercel Blob HTTP client (new)

A small, dependency-free client modelled on the design's description of the old backend ("clean,
dependency-free, correctly lazy on the token"):

- `put(pathname: str, data: bytes, content_type: str) -> str` — upload bytes to Vercel Blob, return the
  public URL. Uses `urllib.request` to `PUT https://blob.vercel-storage.com/<pathname>` with
  `Authorization: Bearer <token>`, `x-content-type`, and the Blob API version header; parses the JSON
  response `url`. Random suffix left on (default) for unguessable URLs.
- `delete(url: str) -> None` — `POST`/`DELETE` to the Blob delete endpoint with the URL and the bearer token;
  idempotent (a already-gone blob is not an error we surface).
- **Lazy token.** Read `BLOB_READ_WRITE_TOKEN` from the environment *inside* the call, not at import — so the
  module imports fine in dev/CI without a token (matches the design's "correctly lazy on the token").
- **Local-dev fallback (§11 Q1, proposed default = yes).** If `BLOB_READ_WRITE_TOKEN` is unset, fall back to
  Django's filesystem storage: write under `MEDIA_ROOT`, return a `MEDIA_URL`-based URL; `delete` unlinks the
  file. This keeps `runserver` fully functional with no Blob account. Selected by token presence, so prod
  (token set) always uses Blob. `MEDIA_ROOT`/`MEDIA_URL` added to `base.py` (§5.8); `media/` stays gitignored.

`blob.py` never imports Django models — pure I/O boundary, unit-swappable.

### 5.3 `core/services/photos.py` — thumbnail + upload orchestration (new)

- `MAX_UPLOAD_BYTES` (proposed 10 MB) and `THUMBNAIL_SIZE` (proposed 400×400, `Image.thumbnail`, aspect
  preserved) as module constants.
- `process_upload(file, owner_id: int) -> tuple[str, str]` — the single entry point the serializer calls:
  1. **Validate** the uploaded file with Pillow: `Image.open(...).verify()` to confirm it is a real image;
     reject on failure → raise a `ValueError`/`DjangoValidationError` the serializer maps to
     `invalid_image`. Enforce `size <= MAX_UPLOAD_BYTES` → `photo_too_large`. Accept JPEG/PNG/WebP (design
     shows phone capture; `mvp-routes.md`).
  2. **Normalize + thumbnail** (this *is* "thumbnail on save"): re-open (verify consumes the file), convert to
     RGB, save the full image to an in-memory buffer (JPEG, sane quality) and a thumbnail buffer. All in
     memory — the serverless FS is ephemeral (epic §3 "generated on save with Pillow, before Blob upload").
  3. **Upload both** via `blob.put`, using deterministic-ish pathnames namespaced by owner, e.g.
     `photos/<owner_id>/<uuid>.jpg` and `.../<uuid>_thumb.jpg`. Return `(photo_url, thumbnail_url)`.
- No Django/DRF imports beyond the validation-error type; keeps it a service, not a view.

### 5.4 `core/api/serializers.py` — photo fields on `MeasurementSerializer` (edit)

Extend the existing `MeasurementSerializer` (do not fork it — one measurement shape):

- Add write field `photo = serializers.ImageField(write_only=True, required=False, allow_null=True)`
  (DRF `ImageField` runs Pillow's basic check; `photos.process_upload` does the authoritative validation +
  size cap). `ImageField` requires Pillow, already added (§6).
- Add read-only `photo_url` and `thumbnail_url` to `fields` and `read_only_fields` — every payload now carries
  the public URLs (AC-6). They are never client-settable.
- `create(self, validated_data)`:
  - pop `photo`; if present, call `photos.process_upload(photo, owner_id=self.context["request"].user.pk)` and
    set `photo_url`/`thumbnail_url` on `validated_data` before `super().create(...)`.
  - map the service's validation errors to `{"photo": "invalid_image"|"photo_too_large"}`.
- `update(self, instance, validated_data)`:
  - if a new `photo` is supplied: process it, then **delete the old blobs** (if any) via
    `blob_cleanup.delete_photo_blobs(instance)` *after* the new URLs are persisted, so a failed upload never
    orphans the record without an image. Replace `photo_url`/`thumbnail_url`.
  - a `PATCH` without `photo` leaves the existing photo untouched (numbers-only edit still works, P2 behavior
    preserved).
- Keep the P2 `validate()` unit-band logic unchanged; photo handling is create/update only.

The forced owner (`perform_create` → `serializer.save(user=request.user)`) is unchanged (P2). `photo` upload
uses `request.user.pk` for the pathname via serializer `context` (DRF passes `request` in context by default
for viewsets).

### 5.5 `core/services/blob_cleanup.py` + signal — delete-on-delete (new; AC-3)

- `delete_photo_blobs(measurement) -> None` — if `measurement.photo_url` / `thumbnail_url` are set, call
  `blob.delete(...)` for each; swallow "already gone" so it is idempotent and never blocks the DB delete.
- **`post_delete` receiver** on `Measurement`, registered in `core/apps.py` `CoreConfig.ready()`:
  `post_delete` fires for **both** a direct `Measurement.delete()` **and** a cascade delete when the owning
  trainee is removed (`on_delete=CASCADE`) — the single mechanism that satisfies both AC-3 clauses
  ("delete own → removes blob" and "remove trainee → cascades; cleans blobs"). A `save()`/`delete()` override
  on the model would miss the cascade path, which is exactly the bug being fixed.
- Wiring lives in `apps.py` `ready()` (import the receiver module) so the signal connects on app load; the
  receiver itself sits in `blob_cleanup.py` (or a thin `signals.py` importing it — §11 Q4).

> **Cross-request-cycle note.** The blob delete is best-effort synchronous in-request (no task queue in MVP).
> If the Blob API call fails, the DB row is still deleted and the blob may linger — logged, accepted risk for
> MVP (a periodic orphan sweep is post-MVP, epic §Out-of-scope-ish; call out in §8).

### 5.6 `core/api/views.py` — multipart + thin wiring (edit)

- Add `parser_classes = [MultiPartParser, FormParser, JSONParser]` to `MeasurementViewSet` so the multipart
  photo `POST`/`PATCH` is accepted alongside JSON. (DRF's global default already includes these, but set them
  explicitly on the viewset so the contract is legible and independent of settings.)
- No other view logic changes for standard verbs — the serializer does the upload; the view stays thin.

### 5.7 `core/api/views.py` + `core/api/urls.py` — the `photos` compare feed (edit; AC-5)

- Add a `photos` **list action** on `MeasurementViewSet` (a plain method, wired via an explicit path — the
  repo uses explicit `path()`s, not a router):
  - resolves the target via the existing `get_target_user` (so `?user=` + `can_access` gating is identical to
    the list action) and returns
    `Measurement.objects.filter(user=target).exclude(photo_url="").select_related("user")`.
  - serialized with `MeasurementSerializer` (payload already carries `photo_url`/`thumbnail_url` + dates +
    id — everything the compare picker needs). Paginated like the main list.
  - Permission: reuse `MeasurementAccessPermission` — its `has_permission` already gates the resolved target
    through `can_access`; `photos` is a safe GET so no owner-only branch applies (trainer-owns → 200).
- `urls.py`: add `path("measurements/photos", _measurement_photos, name="measurement-photos")`
  **before** the `measurements/<int:pk>` route. Literal `photos` cannot match `<int:pk>` anyway, but ordering
  it first keeps intent obvious and pre-empts any future non-int pk change (P2 §8 flagged this collision-class
  for `series` too). `_measurement_photos = MeasurementViewSet.as_view({"get": "photos"})`.

### 5.8 `progresso/settings/base.py` + `.env.example` (edit)

- Add `MEDIA_URL = "media/"` and `MEDIA_ROOT = BASE_DIR / "media"` (for the dev fallback only, §5.2).
- No `DEFAULT_FILE_STORAGE`/`STORAGES` change — the Blob client is called directly, not through Django's
  storage abstraction (keeps the client dependency-free and host-agnostic; the fallback uses plain
  `FileSystemStorage` internally in `blob.py`).
- `.env.example`: document `BLOB_READ_WRITE_TOKEN=` (unset ⇒ local filesystem fallback; set in prod).

### 5.9 `core/models/__init__.py` / `core/admin.py` (edit)

- `admin.py`: add `photo_url` (or a boolean "has photo") to the `Measurement` list_display so admins can
  spot-check — admin stays outside the SPA (epic §3). No new export.
- `__init__.py`: no new symbol (photo fields live on the existing `Measurement`); no change unless a helper is
  extracted.

---

## 6. File Plan

New modules open with `from __future__ import annotations`; full type hints; PEP 8. No test files (epic §3).

| File | Change | Notes |
|------|--------|-------|
| `requirements.txt` | edit | add `Pillow>=10,<12` (thumbnails, `ImageField`). Blob client is stdlib-only. |
| `core/models/measurement.py` | edit | add `photo_url`, `thumbnail_url` URL fields (§5.1). No `save()` override. |
| `core/services/blob.py` | **new** | Vercel Blob HTTP client `put`/`delete`, lazy token, filesystem dev-fallback (§5.2) |
| `core/services/photos.py` | **new** | Pillow validation + thumbnail + two-blob upload orchestration (§5.3) |
| `core/services/blob_cleanup.py` | **new** | `delete_photo_blobs` + `post_delete` receiver (§5.5) |
| `core/api/serializers.py` | edit | `photo` write-only + `photo_url`/`thumbnail_url` read-only; `create`/`update` call the service, map errors to i18n keys (§5.4) |
| `core/api/views.py` | edit | `parser_classes` for multipart; `photos` list action (§5.6, §5.7) |
| `core/api/urls.py` | edit | add `measurements/photos` route before the pk route (§5.7) |
| `core/apps.py` | edit | connect the `post_delete` receiver in `ready()` (§5.5) |
| `core/admin.py` | edit | show photo presence in `Measurement` admin list (§5.9) |
| `progresso/settings/base.py` | edit | `MEDIA_URL`/`MEDIA_ROOT` for the dev fallback (§5.8) |
| `.env.example` | edit | document `BLOB_READ_WRITE_TOKEN` (§5.8) |
| `core/migrations/0003_measurement_photo.py` | **new (generated)** | `makemigrations` — the two URL fields |

No frontend (P5+). No `CLAUDE.md` (still deferred per P1/P2).

---

## 7. Manual verification (no automated tests — epic §3)

Prereq (same personas as P2 §7): trainer **T1** + its trainee **A**; second trainer **T2** + its trainee
**B**. Log in per persona for a session cookie + CSRF token (`GET /auth/me` seeds `csrftoken`; send
`X-CSRFToken` on unsafe requests). Have a small real JPEG on hand. Run with **no** `BLOB_READ_WRITE_TOKEN`
first (exercises the filesystem fallback), then optionally repeat against a real Blob token in a prod-like env.

1. **Migrate (AC-1).** `python manage.py makemigrations core` → `0003_measurement_photo.py`;
   `python manage.py migrate` clean. `pip install Pillow`. `runserver` boots.
2. **Create with photo (AC-2, AC-6).** As **A**: multipart `POST /api/v1/measurements` with
   `unit_system=metric`, `weight=82.5`, and `photo=@body.jpg` → `201`. Response includes non-empty
   `photo_url` **and** `thumbnail_url`; `user` == A. Open both URLs in a browser — full image and a smaller
   (~400px) thumbnail both load. (Fallback mode: files appear under `media/photos/<A id>/…`, gitignored.)
3. **Create numbers-only still works (P2 preserved).** As **A**: JSON `POST` with no `photo` → `201`,
   `photo_url`/`thumbnail_url` empty. Confirms photo is optional.
4. **Bad upload rejected (AC-2 validation).** As **A**: `POST` a `.txt` renamed `.jpg` as `photo` → `400`
   `{"photo":"invalid_image"}`. `POST` a >10 MB image → `400 {"photo":"photo_too_large"}`. Bodies are i18n
   **keys**, not English (epic Q6).
5. **Replace photo on PATCH (AC-2).** As **A**: `PATCH /measurements/<M>` with a new `photo` → `200`, new
   URLs differ from step 2; the **old** blob/file is gone (fallback: old file removed from `media/`; Blob:
   old URL 404s). A `PATCH` with only numbers leaves the photo URLs unchanged.
6. **Compare feed (AC-5).** As **A**: `GET /api/v1/measurements/photos` (no `user`) → `200`, paginated;
   only A's rows **that have a photo** (step 3's numbers-only row is absent), each with photo + thumbnail
   URLs. As **T1**: `GET /measurements/photos?user=<A id>` → `200` (owns A). As **T1**:
   `?user=<B id>` → `403`. As **A**: `?user=<B id>` → `403`.
7. **Delete removes blob (AC-1, AC-3).** As **A**: note `<M>`'s URLs, then `DELETE /measurements/<M>` →
   `204`. The photo **and** thumbnail are gone (fallback: files unlinked; Blob: URLs 404). `GET
   /measurements/<M>` → `404`.
8. **Trainer cannot mutate (matrix).** As **T1**: multipart `POST` (create) → `403` (trainee-only). As
   **T1**: `DELETE /measurements/<A row>` → `403` (owner-only). Confirms P2 gating still holds with photos.
9. **Cascade cleanup (AC-3, the §2 #9 fix).** Give **B** a measurement with a photo. Delete user **B**
   (Django admin, or the P7 trainee-remove path once it exists — for P3, admin delete suffices): B's
   measurement rows cascade-delete **and** their blobs/files are removed (verify the `media/photos/<B id>/`
   files are gone, or the Blob URLs 404). This is the cascade path a `save()`/`delete()` override would miss.
10. **Predicate unchanged (epic §10).** `grep can_access core/api/` — the `photos` action and permission
    still delegate to `can_access`/`accessible_data_filter`; no new trainer→trainee literal in `core/api/`
    or the services.
11. **No proxy (AC-5).** Confirm there is **no** media-streaming Django view; payload URLs point straight at
    Blob (or `MEDIA_URL` in fallback).

---

## 8. Risks / notes

- **"Reuse" ≠ present.** The old Blob backend is not in this repo (§scope note). P3 writes it fresh; if a
  developer expected to import existing code, there is none — this is the intended build, matching the
  design's described shape.
- **Best-effort blob delete.** Cleanup is synchronous, in-request, no task queue (MVP). A failed Blob delete
  logs and leaves an orphan; the DB delete still succeeds. A periodic orphan sweep / `export-delete-my-data`
  reconciliation is P8/post-MVP (`rebuild-analysis.md` §7 Data lifecycle).
- **Upload is synchronous.** Thumbnail + two Blob PUTs happen in the request. Acceptable for MVP single-photo
  capture; large images are capped at 10 MB. Async upload / direct-to-Blob client upload is post-MVP.
- **Shared model file (P2/P3/P4).** P3 touches only the two URL fields; must not pre-empt P4's `bmi` property
  or series work. Field-add migration only — safe on greenfield.
- **`ImageField` needs Pillow at import of the serializer** — Pillow is now a hard dependency; ensure it is in
  `requirements.txt` and installed before `runserver` (step 1).
- **Filesystem fallback in prod would be wrong** (ephemeral serverless FS). Guarded: fallback triggers only
  when `BLOB_READ_WRITE_TOKEN` is unset — prod must set it. `prod.py` could assert the token is present to
  fail fast (proposed, §11 Q1).
- **Blob API surface** (endpoints/headers/version) should be pinned against Vercel's current Blob HTTP API at
  implementation time; the client is small and dependency-free by design so pinning is a one-file change.

---

## 9. Multi-role considerations

Same as P2: the tenancy boundary is the trainer↔trainee relationship, resolved **only** through
`can_access`. The `photos` feed adds no new role logic — a trainer sees a trainee's photos iff
`can_access` says so; a trainee sees only their own; other-trainer is `403`. Create/delete stay
trainee-owner-only (photos don't loosen that). Helper access remains post-MVP and untouched.

---

## 11. Open questions — all RESOLVED (developer 2026-08-11: accept all defaults)

- **Q1 — RESOLVED (adopted).** Local-dev filesystem fallback when `BLOB_READ_WRITE_TOKEN` unset; prod asserts token present.
- **Q2 — RESOLVED (adopted).** `MAX_UPLOAD_BYTES = 10 MB`, thumbnail `400×400` aspect-preserved JPEG.
- **Q3 — RESOLVED (adopted).** Accept JPEG/PNG/WebP, normalize to JPEG. HEIC/`pillow-heif` deferred (post-MVP).
- **Q4 — RESOLVED (adopted).** Single `blob_cleanup.py` (service + `post_delete` receiver), imported in `apps.ready()`.
- **Q5 — RESOLVED (adopted).** Store Blob URL only, no separate pathname/key column.
- **Q6 — RESOLVED (adopted).** `photos` feed returns both photo + thumbnail URLs per row.

### Original proposals (for reference)

- **Q1 — Local-dev Blob fallback. PROPOSAL: yes.** When `BLOB_READ_WRITE_TOKEN` is unset, `blob.py` falls
  back to filesystem `MEDIA` storage so `runserver` works with no Blob account; prod (token set) always uses
  Blob, and `prod.py` asserts the token is present to fail fast. *Alternative:* require the token always
  (simpler code, but no offline dev). Recommend the fallback.
- **Q2 — Upload size + thumbnail dimensions. PROPOSAL:** `MAX_UPLOAD_BYTES = 10 MB`, thumbnail `400×400`
  (aspect-preserved, JPEG). Adjust if the P7 compare UI wants a larger thumbnail.
- **Q3 — Accepted image formats. PROPOSAL:** JPEG, PNG, WebP in; all normalized to **JPEG** on store (smaller,
  universal). Reject anything Pillow can't verify. HEIC (iPhone) is **not** decoded by stock Pillow — flag: if
  phone HEIC uploads matter for P6 capture, add `pillow-heif` (post-MVP unless you want it now).
- **Q4 — Cleanup module name. PROPOSAL:** keep the epic's `blob_cleanup.py` holding both
  `delete_photo_blobs` and the `post_delete` receiver; `apps.py` imports it in `ready()`. *Alternative:* a
  separate `core/signals.py` importing the service. Recommend the single file (matches epic §3 file list).
- **Q5 — Store the Blob URL only, or also a pathname/key?** PROPOSAL: **URL only** — Vercel Blob delete takes
  the URL, so a separate key column is redundant. Revisit only if we later need to enumerate/clean blobs
  independently of the DB (the post-MVP orphan sweep).
- **Q6 — Serve thumbnail vs full in the `photos` feed.** PROPOSAL: return **both** URLs in every row; let the
  P7 UI pick thumbnail for the picker grid and full for the compare view. No server-side variant negotiation.

---

Plan saved to `tasks/plans/feature-P3-media-photos-blob-lifecycle.md`.

---

## 13. Post-Implementation

**Built.** Progress-photo lifecycle on `Measurement`, backend-only. Two `URLField`s
(`photo_url`, `thumbnail_url`) hold Vercel Blob public URLs; a write-only `photo` upload field on
`MeasurementSerializer` runs a Pillow validate → normalize-to-JPEG → 400×400 thumbnail → two Blob
`PUT`s at the create/update boundary. A `post_delete` receiver on `Measurement` (wired in
`CoreConfig.ready()`) deletes both blobs on direct delete **and** trainee-cascade delete — the §2 #9
leak fix. New `GET /api/v1/measurements/photos?user=:id` feed lists photo-bearing rows through the same
`can_access` gate. A dependency-free stdlib (`urllib`) Blob client with a lazy token falls back to
filesystem `MEDIA` storage when `BLOB_READ_WRITE_TOKEN` is unset, so dev runs with no Blob account;
`prod.py` asserts the token.

**Verified.** Manual driver against the real DRF stack (APIClient + `force_authenticate`, no test files)
in filesystem-fallback mode: 33/35 checks PASS; the 2 fails were bad driver test data (a solid-color
6000² JPEG compressed under 10 MB so the size cap correctly didn't trip) — re-ran with a genuine 17 MB
image → `400 {"photo": "photo_too_large"}`. All §7 ACs hold: create+photo, numbers-only, invalid-image
+ oversize rejection (i18n keys), PATCH replace with old-blob cleanup, compare feed + 403 matrix, delete
cleanup, trainer-cannot-mutate, and user-delete cascade cleanup.

**Files:** see §6. Migration generated then renamed to `0003_measurement_photo.py` (matches §6). `Pillow
11.3.0` installed in the venv.

**Follow-ups / notes for the developer:**
- **Blob API surface unpinned against live Vercel.** `blob.py` uses `x-api-version: 7`, `PUT /<pathname>`,
  `POST /delete {urls:[…]}`, `x-add-random-suffix: 1`. Verified only in FS-fallback mode locally — the
  real Blob path must be smoke-tested against a live token before prod (§8). It's a one-file change if the
  API differs.
- **`MEDIA_URL = "media/"`** (no leading slash, per plan §5.8) — dev media served via `static()` in
  `progresso/urls.py` under `DEBUG`. Inert in prod (Blob returns absolute URLs).
- **Best-effort synchronous cleanup** (no task queue): a failed Blob delete is logged and swallowed; the DB
  row still deletes. Periodic orphan sweep is post-MVP (§8).
- **Skill template mismatch:** the `/implement-feature` skill assumes a PHP/Symfony repo (`./ops cs`,
  Twig, Doctrine). This is Django/Python — used `flake8` (line-length 99, no project config) + `manage.py
  check` in place of `./ops cs`. No PHP conventions applied.
- **Shared model file:** touched only the two URL fields + docstring; P4's `bmi`/series surface left
  untouched.
