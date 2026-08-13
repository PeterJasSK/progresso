# Feature Plan: P12 — Mobile nav menu + progress-photo upload fix

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved) — post-MVP follow-up (like P9/P10/P11).
**Plan ID:** P12
**Slug:** mobile-menu-blob-fix
**Author:** Claude (Opus)
**Date:** 2026-08-13
**Status:** Implemented — `tsc` strict + `npm run build` clean, `manage.py check` + `makemigrations --check` clean. Prod photo path pending live verification (§5.6).

> **No GitHub issue.** AC quoted from the developer's request this session.
> **No automated tests** (epic §3). Verification is manual only (§5).

---

## 1. Goal

Two independent items in one plan.

**A — Mobile topbar collapses into a menu.** The authenticated topbar (`AppShell.tsx`) renders the
language switcher, theme toggle, profile avatar and logout button in an always-on `ml-auto` row with no
breakpoint handling. On a phone this row crowds the logo. Collapse those four controls behind a hamburger
menu on mobile, using the **exact pattern from `qeaas.eu`** (the developer's own project): a `☰` button that
opens a full-screen slide-down overlay, desktop layout unchanged.

**B — Progress-photo upload is dead on the live app.** Uploading a photo on `progresso.peterjas.sk` fails.
The Blob service code is correct; the failure is the **Vercel Functions 4.5 MB request-body limit**. Fix so
real phone photos upload.

---

## 2. Acceptance criteria (from the request)

> "the mobile version of the navigation needs to be hidden — the en/sk, the light/dark, the profile and
> logout button needs to be hidden under same style of menu as is implemented in qeaas.eu, the exactly same
> implementation."

- **AC-1** On viewports `< md` (Tailwind `md` = 768px), the topbar shows only the logo + a `☰` menu button.
  Language switcher, theme toggle, profile avatar, and logout are **not** visible inline.
- **AC-2** Tapping `☰` opens a full-screen slide-down overlay (below the header) containing, stacked and
  centered: language switcher, theme toggle, profile link, logout. Tapping `☰` again (now `✕`) or selecting
  an item closes it. Matches qeaas: `fixed inset-0 top-[header] z-40 flex flex-col items-center gap-8 …
  transition-all duration-500 ease-in-out md:hidden`, closed = `invisible pointer-events-none
  -translate-y-full opacity-0`, open = `visible pointer-events-auto translate-y-0 opacity-100`.
- **AC-3** On `>= md` the topbar is **unchanged** — the same inline `ml-auto` row it is today (the overlay and
  the `☰` are `md:hidden`; the inline cluster is `hidden md:flex`).

> "the photo is not working — i cant upload a picture on the live app, the blob is not working, why? and fix it."

- **AC-4** A photo taken on a phone (typically 3–12 MB) uploads successfully on the live app and appears in
  the measurement + photo-compare views.
- **AC-5** Carried invariants: no hardcoded UI strings (all via `t()`, EN+SK parallel); no hardcoded hex
  (design tokens only); numbers/dates mono; `tsc` strict + `npm run build` clean; `python manage.py check`
  clean.

---

## 3. Root-cause analysis — why photo upload fails in prod (item B)

Deployment is Vercel: the Django WSGI app runs as a Python serverless function (`api/index.py`), reached via
`vercel.json` rewrites for `/api`. The upload path:

`MeasurementForm.tsx` → `FormData(photo)` → `POST /api/v1/measurements/` (multipart) → DRF
`MeasurementViewSet` → `MeasurementSerializer._process_photo` → `photos.process_upload` → `blob.put` (PUT to
`https://blob.vercel-storage.com/{pathname}`).

**The Blob client code is correct** (`core/services/blob.py`) — the PUT shape matches the current
`@vercel/blob` SDK (Bearer token, `x-content-type`, `x-add-random-suffix`, PUT to
`blob.vercel-storage.com/{pathname}`). It works in dev because dev has no token and writes to the local
filesystem, which has no size limit.

**Root cause: the Vercel Functions request-body limit is 4.5 MB.** A body over the limit is rejected at
Vercel's edge with `413 FUNCTION_PAYLOAD_TOO_LARGE` **before the request ever reaches Django** — so no Blob
call is even attempted. The app allows uploads up to `MAX_UPLOAD_BYTES = 10 MB` (`photos.py:23`), and modern
phone photos routinely exceed 4.5 MB. Every full-resolution phone photo therefore fails; the local-dev
filesystem path never sees the limit, which is why "it works on my machine."

Confirmation test: on the live app, upload a small (<1 MB) screenshot. If that succeeds while phone photos
fail → confirmed 4.5 MB limit. (If even a tiny image fails, the cause is instead the Blob call itself — see
secondary hardening below, which we do regardless.)

**Secondary (defensive, not the root cause):**
- `blob.py` pins `x-api-version: "7"`; the current SDK sends `12`. Vercel keeps old versions working, but bump
  to `12` to stay on the supported contract.
- A non-2xx from Blob makes `urllib.urlopen` raise `HTTPError`, which is **unmapped** in `_process_photo`
  (`serializers.py:405`) → bubbles as an opaque HTTP 500 with no translation key. Wrap Blob failures in a
  `BlobUploadError`, map to a `photo_upload_failed` key, and `logging.exception` it so prod stdout shows why.

---

## 4. Design / approach

### 4A. Mobile menu (`AppShell.tsx` + new `MobileMenu.tsx`)

Extract the toggle cluster so it renders in two places without duplicating logic.

- **Shared controls fragment.** The four controls (LanguageSwitcher, ThemeToggle, profile `Link`, logout
  `Button`) become the children of a small helper so the inline desktop row and the mobile overlay render the
  same elements. Logout still calls the existing `handleLogout`.
- **Desktop cluster** (`AppShell.tsx:46`): add `hidden md:flex` so it disappears below `md`.
- **Mobile trigger + overlay** — new `frontend/src/components/MobileMenu.tsx`:
  - `open` state via `useState(false)`; auto-close on route change (`useLocation` effect) and on selecting an
    item.
  - Trigger: `<button aria-label={t('nav.menu')} aria-expanded={open} className="md:hidden flex h-11 w-11
    items-center justify-center rounded-full text-2xl text-heading focus:outline-none focus:ring-2
    focus:ring-accent">` showing `☰` / `✕`.
  - Overlay: `fixed inset-0 top-[57px] z-40 flex flex-col items-center gap-8 overflow-y-auto bg-bgdeep pt-12
    transition-all duration-500 ease-in-out md:hidden` + open/closed class sets from AC-2. (`top` offset =
    header height; header is `py-3` + `text-lg` ≈ 57px — verify against the live header and use the actual
    value / a token.) Overlay uses **design tokens** (`bg-bgdeep`, `text-heading`, `text-accent`) — qeaas'
    literal `bg-bg-deep`/`text-text` map to our token names, not copied verbatim.
  - Body scroll lock while open (`overflow-hidden` on `document.body` in the effect) — optional polish.
- **i18n:** add `nav.menu` (e.g. EN "Menu" / SK "Menu") to both catalogs. Reuse existing `nav.profile`,
  `nav.logout`.

### 4B. Photo upload fix

**Primary — client-side downscale before upload (`frontend`).** Keep the existing multipart→server→Blob flow
(server stays the single trust + validation boundary); just guarantee the body clears 4.5 MB. Before building
`FormData` in `MeasurementForm.tsx`, run the selected file through a new
`frontend/src/lib/imageResize.ts`:

- Draw the image to a `<canvas>` scaled so the longest edge ≤ ~1600px, export
  `canvas.toBlob(..., 'image/jpeg', 0.85)`, and upload the resulting Blob (filename `photo.jpg`) instead of
  the raw file. A 1600px JPEG @ q0.85 is well under 1 MB — safely below 4.5 MB while still high enough quality
  for progress compare. Non-image / decode failure → fall back to the original file (server still validates).
- The server already normalizes to JPEG + thumbnails, so downstream is unaffected; this only shrinks the
  transport payload.

**Secondary — server hardening (`blob.py` + `serializers.py`):**
- Bump `_API_VERSION = "12"` in `blob.py`.
- Add `class BlobUploadError(RuntimeError)` in `blob.py`; in `put`/`delete` wrap the `urlopen` in
  `try/except (urllib.error.HTTPError, urllib.error.URLError)` → `logging.exception(...)` → raise
  `BlobUploadError`.
- In `serializers._process_photo`, `except blob.BlobUploadError:` →
  `raise serializers.ValidationError({"photo": "photo_upload_failed"})`. Add `errors.photo_upload_failed` to
  EN+SK.

> **Not chosen:** Vercel Blob *client upload* (browser PUTs straight to Blob, bypassing the function limit
> entirely). It removes the 4.5 MB ceiling for good but needs a token-minting endpoint and a trust-model
> change (client-authored blobs) — heavier than MVP warrants. Client downscale keeps the server as the sole
> writer and fixes the actual symptom. Revisit client-upload only if >1600px originals must be preserved.

---

## 5. Verification (manual — epic §3)

1. `cd frontend && npm run build` — tsc strict + Vite + PWA clean.
2. `python manage.py check` — clean.
3. **Menu (mobile):** DevTools ≤767px — topbar shows logo + `☰` only; the four controls are hidden inline.
   Tap `☰` → overlay slides down with language/theme/profile/logout centered; `✕` and item-select both close;
   language + theme toggles still work from inside the overlay; logout logs out.
4. **Menu (desktop):** ≥768px — topbar identical to today; no `☰`, no overlay.
5. **Photo (local):** log a measurement with a large (>5 MB) photo via dev server → confirm it appears
   (filesystem store).
6. **Photo (prod):** on `progresso.peterjas.sk`, upload a full-res phone photo → confirm success + it renders
   in measurement + photo-compare. Pre-fix confirmation: a <1 MB image succeeds while a full-res one 413s.
7. **Error path:** confirm a genuinely broken image surfaces `t('errors.invalid_image')`, and (if reproducible)
   a Blob failure surfaces `t('errors.photo_upload_failed')` rather than a raw 500.

---

## 6. File plan

| Layer | File | Change |
|---|---|---|
| Frontend / shell | `frontend/src/components/AppShell.tsx` | Desktop cluster → `hidden md:flex`; render `<MobileMenu>`; share the controls fragment. |
| Frontend / shell | `frontend/src/components/MobileMenu.tsx` | **New.** `☰`/`✕` trigger + slide-down overlay (qeaas pattern, our tokens); auto-close on route change / select. |
| Frontend / upload | `frontend/src/lib/imageResize.ts` | **New.** Canvas downscale (longest edge ≤1600px) → JPEG Blob; fallback to original on failure. |
| Frontend / upload | `frontend/src/pages/MeasurementForm.tsx` | Run the picked file through `imageResize` before `FormData.append('photo', …)`. |
| Frontend / i18n | `frontend/src/i18n/en.json`, `sk.json` | Add `nav.menu`, `errors.photo_upload_failed`. |
| Backend / blob | `core/services/blob.py` | `_API_VERSION = "12"`; `BlobUploadError`; wrap `urlopen` → log + raise. |
| Backend / api | `core/api/serializers.py` | Map `BlobUploadError` → `{"photo": "photo_upload_failed"}`. |

---

## 7. Out of scope

- No redesign of the desktop topbar or the page-level sub-navs (`TraineeNav`/`TrainerNav`).
- No Vercel Blob client-upload rework (see §4B note).
- No change to server photo processing (validation, JPEG normalize, thumbnail) beyond error surfacing.
- Raising the 10 MB server ceiling is moot once the client downscales; left as-is.
