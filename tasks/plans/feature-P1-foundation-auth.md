# Feature Plan: P1 — Foundation & Auth

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved)
**Plan ID:** P1
**Slug:** foundation-auth
**Author:** Claude (Opus)
**Date:** 2026-08-11
**Status:** Complete (2026-08-11; Q1 open-registration, Q2–Q5 defaults adopted)

> No GitHub issue. ACs are quoted from the design docs (`tasks/design/*.md`) via the epic §9 P1 brief.
> Repo is greenfield: no `manage.py`, no `core/`, no `requirements.txt`. This plan scaffolds the whole
> Django + DRF project from scratch, so P2–P8 have a skeleton to hang off.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7.

---

## 0. Deviation from the approved epic (developer directive 2026-08-11)

The epic (`mvp-routes.md` §B Users, §C: "create trainee / roster → trainer only"; epic §9 P7) has
**trainers create trainee accounts**. The developer overrides this: **open self-registration**, so account
creation is frictionless and public from day one. Concretely:

- Anyone can `POST /api/v1/auth/register` unauthenticated — no trainer needed to onboard.
- The registrant chooses their `role` (trainee or trainer) at signup.
- A trainee **picks a trainer at signup** from a public list (`GET /api/v1/auth/trainers`), setting
  `head_trainer` immediately. Picking is optional-tolerant (blank = unlinked, may link later).
- After a successful register the user is **logged in automatically** (session set) — straight into the app.

**Epic impact to reconcile later (not done in P1):** P7's `POST /api/v1/trainees` (trainer-creates-trainee)
is now redundant for onboarding; P7 keeps only roster read + trainer-side edits. Epic §5/§7 and the P7 brief
should be updated to reflect open signup. Flagged, not edited here (plan command edits only this file).

---

## 1. Goal

Deliver the skeleton everything else hangs off:

- Django + DRF project scaffold with a dev/prod settings split, env-driven config (host-agnostic).
- Confirmed `.gitignore` keeps `db.sqlite3` + `media/` out of the repo.
- The layered `core/` layout (`models/`, `api/`, `services/`) from epic §3.
- `CustomUser` with `role` / `head_trainer` / `helpers`, hosting the **single** `can_access()` predicate.
- DRF permission classes that consume `can_access()` — no inline `if role` checks anywhere.
- Session-based auth endpoints: `register`, `login`, `logout`, `me`, `trainers` (HTTPS, CSRF-protected,
  secure httpOnly cookies).
- **Open, frictionless self-registration** (developer directive 2026-08-11): anyone signs up, chooses
  trainee or trainer, and a trainee picks their trainer at signup. See §0 deviation.

This is the "secure, deployable core" half of the P1+P2 first ship (epic §6). P1 alone exposes only `/auth`.

---

## 2. Acceptance criteria (quoted from design docs via epic §9)

- [x] **AC-1** "Project scaffold: DRF, settings split (dev/prod), `.gitignore` fixes (drop db + media from
  repo)." (`rebuild-analysis.md` §6 A1). **CI test gate dropped** (epic §3).
  **Covered by:** `progresso/settings/base.py:1`, `progresso/settings/dev.py:1`, `progresso/settings/prod.py:1`;
  `.gitignore:21` (`*.sqlite3`), `.gitignore:22` (`media/`). Verified: `migrate` + `runserver` boot clean
  (§7.1); `git check-ignore` returns both, no data files in `git ls-files` (§7.2).
- [x] **AC-2** "Custom user + roles + the single `can_access` predicate." (`rebuild-analysis.md` §6 A2)
  **Covered by:** `core/models/user.py:13` (`Role`), `core/models/user.py:22` (`CustomUser`),
  `core/models/user.py:46` (`can_access`). Matrix verified by hand — all 6 rows PASS (§7.4).
- [x] **AC-3** "DRF permission classes built on `can_access`." (`rebuild-analysis.md` §6 A3). **Permission test
  matrix dropped**; the access rules are verified by hand (epic §5 checklist, this plan §7).
  **Covered by:** `core/api/permissions.py:25` (`CanAccessTarget`) delegates solely to
  `request.user.can_access(target)` (`core/api/permissions.py:50`); no inline role check anywhere.
- [x] **AC-4** "Auth endpoints: login, logout, token/JWT, password set for trainer-created accounts."
  (`rebuild-analysis.md` §6 A4). **MVP = session auth only** (epic Q2): HTTPS, CSRF protection, secure +
  httpOnly session cookies; **no JWT**. Per §0, "password set for trainer-created accounts" is **replaced by
  open self-registration** — the user sets their own password at signup.
  **Covered by:** session-only DRF auth `progresso/settings/base.py:80`; secure cookies
  `progresso/settings/prod.py:22-25`. `check --deploy` shows no session/CSRF-cookie warnings (§7.8).
- [x] **AC-5** Auth endpoints exist and behave per `mvp-routes.md` §B Auth:
  - `POST /api/v1/auth/login` — `{username, password}` → sets session cookie, returns `{id, username, role}`.
  - `POST /api/v1/auth/logout` — clears the session.
  - `GET /api/v1/auth/me` — returns the current user `{id, username, role}`; the frontend bootstraps from it.
  **Covered by:** `core/api/views.py:52` (`LoginView`), `:70` (`LogoutView`), `:81` (`MeView`);
  routes `core/api/urls.py:17-19`. Driven live: login `200`, me `200` + `csrftoken` cookie, logout `204`,
  post-logout me `403` (§7.5–7.7).
- [x] **AC-6** "Zero duplicated views; one authorization predicate" (manually verified, not in CI) + "No data
  files in git." (`rebuild-analysis.md` §10)
  **Covered by:** single predicate `core/models/user.py:46` (only one, consumed by
  `core/api/permissions.py:50`); no data files tracked — `.gitignore:21-22`, empty `git ls-files` match (§7.2).
- [x] **AC-7 (§0 open registration)** `POST /api/v1/auth/register` — unauthenticated (`AllowAny`). Body
  `{username, password, role, trainer_id?}`:
  - `role` ∈ {trainee, trainer}; `admin`/`helper` **rejected** at registration.
  - `role == trainer` → `trainer_id` ignored; `head_trainer = null`.
  - `role == trainee` → optional `trainer_id`; if present it must reference an existing **trainer** user
    (else `400` `invalid_trainer`), and sets `head_trainer`; blank = unlinked.
  - On success: create the user, **log them in** (session set), return `201` `{id, username, role}`.
  - Duplicate username → `400` with translatable key (`username_taken`); weak password → `400`
    `password_too_weak` (Django validators).
  **Covered by:** `core/api/views.py:26` (`RegisterView`, `AllowAny` + auto-`login`),
  `core/api/serializers.py:36` (`RegisterSerializer`): role gate `:51`, dup username `:46`, password `:57`,
  trainer resolution `:65`, `create` sets `head_trainer` `:84`. Driven live: 201 + auto-login for
  trainer & trainee; all 6 negatives return the right key; trainer's `trainer_id` ignored (§7.3a).
- [x] **AC-8 (§0 trainer picker)** `GET /api/v1/auth/trainers` — unauthenticated (`AllowAny`); returns
  `[{id, display_name}]` of users with `role == trainer`, for the signup trainer dropdown. Minimal fields
  only (no email/username-leak beyond a display label). Developer accepted this public trainer-name exposure.
  **Covered by:** `core/api/views.py:40` (`TrainersView`, `AllowAny`),
  `core/api/serializers.py:23` (`TrainerOptionSerializer` — id + display_name only). Driven live: `[]` on
  empty DB, lists trainers after signup (§7.3a).

### The `can_access` contract (epic §3, §5; `mvp-routes.md` §C)

`user.can_access(target_user)` is the single source of access truth. For MVP it must yield:

| Caller role | Target | Result |
|-------------|--------|--------|
| trainee | self | ✅ True |
| trainee | any other user | ❌ False |
| trainer | a trainee whose `head_trainer == self` | ✅ True |
| trainer | a trainee of another trainer | ❌ False |
| trainer | self | ✅ True |
| admin (`is_superuser` / role admin) | anyone | ✅ True |
| helper | head's trainees they're attached to | **post-MVP** — predicate shaped for it, not exercised |

---

## 3. Out of scope (deferred — do not build in P1)

- Any domain endpoint beyond `/auth` (measurements P2, photos P3, series P4, trainees/roster P7, goals
  P6/P7, chat P8).
- JWT / token auth (post-MVP; epic Q2 locks session auth for MVP).
- Trainer-side roster read + trainer-initiated trainee edits → **P7**. (Account creation itself is now open
  self-registration in P1, per §0 — no longer a P7 concern.)
- Post-signup re-linking (trainee changes trainer later, or links after signing up unlinked) → **P7**
  trainer/trainee UI. P1 only sets the link *at* registration.
- Helper / assistant-trainer access resolution → post-MVP. The `helpers` relation and the `can_access`
  branch are *shaped* now but not wired into any live grant.
- Rate-limiting auth → **P8** hardening (`rebuild-analysis.md` §7).
- Frontend / React shell / theme / i18n → **P5**. P1 ships no SPA; endpoints are exercised by hand.
- Sentry / error tracking → dropped (epic §3).

---

## 4. Cross-cutting decisions this plan adopts (from epic §3, no re-litigating)

- **Layered layout.** `core/models/`, `core/api/`, `core/services/` as packages. No monolithic `views.py`.
- **One authorization predicate.** `can_access` on the user model; permission classes consume it; zero
  inline role checks.
- **Session auth**, CSRF-protected, secure + httpOnly cookies over HTTPS (Q2).
- **Host-agnostic config.** All secrets/config via env vars (`SECRET_KEY`, `DATABASE_URL`, later the Blob
  token). Nothing Vercel-specific in P1 app code. SQLite for local dev, Postgres in prod via `DATABASE_URL`.
- **No data files in git** — `db.sqlite3`, `media/` gitignored (already are; verify).
- **strict typing + PSR-equivalent Python style:** `from __future__ import annotations` and full type hints
  on every function/method; PEP 8; no logic in views beyond wiring (thin views).
- **No raw SQL** — Django ORM only.

---

## 5. Design / approach

### 5.1 Project shape

```
manage.py
requirements.txt
progresso/                     # Django project package (settings + root URLconf + wsgi/asgi)
  __init__.py
  settings/
    __init__.py
    base.py                    # shared config, reads env
    dev.py                     # DEBUG=True, SQLite default, relaxed cookies
    prod.py                    # DEBUG=False, DATABASE_URL, secure cookies, HTTPS
  urls.py                      # includes core.api.urls under /api/v1/
  wsgi.py
  asgi.py
core/                          # the one domain app
  __init__.py
  apps.py
  admin.py                     # register CustomUser in Django admin
  models/
    __init__.py                # re-exports CustomUser
    user.py                    # CustomUser + can_access()
  api/
    __init__.py
    permissions.py             # DRF permission classes built on can_access
    serializers.py             # UserSerializer (id, username, role)
    views.py                   # thin auth views: login, logout, me
    urls.py                    # /auth/login, /auth/logout, /auth/me
  services/
    __init__.py                # empty package placeholder (P3/P4 fill it)
  migrations/
    __init__.py
```

`AUTH_USER_MODEL = "core.CustomUser"` set **before the first migration** (epic is greenfield, so this is
clean — no swap-after-migrate pain).

### 5.2 `core/models/user.py` — `CustomUser`

- Subclass `django.contrib.auth.models.AbstractUser` (keeps username/password/email/`is_superuser`).
- Fields:
  - `role: str` — `CharField(choices=Role.choices)`, where `Role` is a `TextChoices` with
    `TRAINEE`, `TRAINER`, `ADMIN`, `HELPER` (HELPER present for shape; unused in MVP grants).
  - `head_trainer` — `ForeignKey("self", null=True, blank=True, on_delete=SET_NULL, related_name="trainees")`.
    A trainee points at its head trainer; a trainer's roster is `self.trainees`.
  - `helpers` — `ManyToManyField("self", symmetrical=False, blank=True, related_name="assisting_for")`.
    Present so the predicate can grow into helper access without a migration; **not consulted in MVP**.
- `can_access(self, target: "CustomUser") -> bool` — the single predicate:
  ```
  if self.is_superuser or self.role == Role.ADMIN: return True
  if self == target: return True
  if self.role == Role.TRAINER: return target.head_trainer_id == self.id
  # HELPER branch intentionally deferred (post-MVP); documented, returns False for now.
  return False
  ```
  Type-hinted, no DB writes, cheap. Trainee falls through to `False` for any non-self target.
- Register in `core/admin.py` so admin stays in Django `/admin/` (epic §3 API-first: admin outside SPA).

### 5.3 `core/api/permissions.py` — DRF permission classes on `can_access`

- `IsAuthenticatedUser` — thin wrapper / rely on DRF `IsAuthenticated`.
- `CanAccessTarget(BasePermission)` — resolves the `target_user` for the request and returns
  `request.user.can_access(target)`. In P1 no domain object exists yet, so this class is **defined and
  documented** as the contract P2+ consume; it is unit-exercised by hand once P2 adds a target. Keep it
  here so the single access authority lives in one file from day one (epic §3).
- No permission class contains an `if role ==` data-access decision other than delegating to `can_access`.
  Role *gating* (e.g. "create is trainee-only") is a separate, explicit concern introduced by the endpoint
  that needs it (P2+), not baked into `can_access`.

### 5.4 Auth views — `core/api/views.py` (thin)

Session-based, DRF `APIView`s (function-thin), all typed:

- `RegisterView(POST)` — `AllowAny`. Delegates to `RegisterSerializer` (§5.4a) for validation
  (role in {trainee,trainer}, username unique, password strength, `trainer_id` resolves to a trainer).
  Creates the user with `set_password`, sets `head_trainer` when a valid `trainer_id` is given, then
  `django.contrib.auth.login(request, user)` for instant entry; returns `201` `UserSerializer(user).data`.
- `TrainersView(GET)` — `AllowAny`. Returns `[{id, display_name}]` for `role == trainer` users, ordered by
  name. `display_name` = `get_full_name()` or `username` fallback. Read-only, no pagination in MVP.
- `LoginView(POST)` — validate `{username, password}` via `django.contrib.auth.authenticate`; on success
  `django.contrib.auth.login(request, user)` (sets session cookie); return `UserSerializer(user).data`.
  On failure → `401` with a **translatable code/key**, not a hardcoded English sentence (epic §3 i18n:
  backend returns keys the frontend localizes, or uses `gettext`). Use e.g. `{"detail": "invalid_credentials"}`.
- `LogoutView(POST)` — `django.contrib.auth.logout(request)`; `204`.
- `MeView(GET)` — `IsAuthenticated`; return `UserSerializer(request.user).data`. Decorate with
  `ensure_csrf_cookie` so the SPA (P5) receives the `csrftoken` cookie needed for later unsafe requests.

`UserSerializer` exposes only `id`, `username`, `role` — no password, no email leak.

### 5.4a Registration serializer — `core/api/serializers.py`

`RegisterSerializer` (typed) is where signup validation lives (thin view, logic in serializer):

- Fields: `username`, `password` (write-only), `role` (choice, trainee/trainer only — reject admin/helper),
  `trainer_id` (write-only, optional, `PrimaryKeyRelatedField` over trainer-role users).
- `validate_role` rejects `ADMIN`/`HELPER` → `400 invalid_role`.
- Object-level: if `role == trainee` and `trainer_id` given, ensure target `role == trainer`
  (`invalid_trainer`); if `role == trainer`, ignore/blank `trainer_id`.
- Run Django `password_validation.validate_password` → `password_too_weak`; unique username → `username_taken`.
- `create()` uses `User.objects.create_user(...)` (hashes password) and sets `head_trainer`.
- All error `detail` values are **keys**, not English prose (epic §3 i18n; frontend localizes).

`TrainerOptionSerializer` — read-only `{id, display_name}` for the `/auth/trainers` list.

### 5.5 Settings split (`progresso/settings/`)

- `base.py`:
  - `SECRET_KEY = os.environ["SECRET_KEY"]` (env-driven; `dev.py` supplies a dev default).
  - `INSTALLED_APPS`: django contrib + `rest_framework` + `core`.
  - `AUTH_USER_MODEL = "core.CustomUser"`.
  - DRF defaults: `DEFAULT_AUTHENTICATION_CLASSES = [SessionAuthentication]`,
    `DEFAULT_PERMISSION_CLASSES = [IsAuthenticated]`. `register`, `login`, and `trainers` override to
    `AllowAny` per-view (public onboarding surface).
  - `DATABASES` via `dj-database-url` parsing `DATABASE_URL` (falls back to SQLite in dev).
  - i18n on: `USE_I18N = True`, `LANGUAGES = [("en", ...), ("sk", ...)]`, `LANGUAGE_CODE = "en"` (EN base
    per epic Q6); `locale/` path reserved for backend `gettext`.
- `dev.py`: `DEBUG=True`, SQLite default, `SESSION_COOKIE_SECURE=False`, `ALLOWED_HOSTS=["*"]` (local).
- `prod.py`: `DEBUG=False`, `DATABASE_URL` required, `SESSION_COOKIE_SECURE=True`,
  `SESSION_COOKIE_HTTPONLY=True`, `CSRF_COOKIE_SECURE=True`, `SECURE_SSL_REDIRECT=True`,
  `SECURE_PROXY_SSL_HEADER` for a proxy host, `ALLOWED_HOSTS` from env. Plain Django logging (no Sentry).
- `DJANGO_SETTINGS_MODULE` chosen via env (default `progresso.settings.dev`).

### 5.6 Dependencies (`requirements.txt`)

`Django` (5.x LTS-line), `djangorestframework`, `dj-database-url`, `psycopg[binary]` (prod Postgres),
`gunicorn` (prod WSGI). No JWT lib, no Sentry, no Blob SDK yet (P3). Pin to compatible minors.

---

## 6. File Plan

All new files. Every module starts with `from __future__ import annotations`; full type hints; PEP 8.

| File | Change | Notes |
|------|--------|-------|
| `requirements.txt` | new | Django, DRF, dj-database-url, psycopg, gunicorn (§5.6) |
| `manage.py` | new | standard, defaults `DJANGO_SETTINGS_MODULE=progresso.settings.dev` |
| `progresso/__init__.py` | new | empty package |
| `progresso/settings/__init__.py` | new | empty |
| `progresso/settings/base.py` | new | shared env-driven config, `AUTH_USER_MODEL`, DRF defaults, i18n (§5.5) |
| `progresso/settings/dev.py` | new | DEBUG, SQLite, relaxed cookies (§5.5) |
| `progresso/settings/prod.py` | new | secure cookies, HTTPS, `DATABASE_URL`, plain logging (§5.5) |
| `progresso/urls.py` | new | root URLconf: `admin/`, `api/v1/` → `core.api.urls` |
| `progresso/wsgi.py` | new | standard |
| `progresso/asgi.py` | new | standard (no Channels; plain ASGI) |
| `core/__init__.py` | new | empty |
| `core/apps.py` | new | `CoreConfig` |
| `core/admin.py` | new | register `CustomUser` |
| `core/models/__init__.py` | new | re-export `CustomUser`, `Role` |
| `core/models/user.py` | new | `CustomUser` + `Role` + `can_access()` (§5.2) — the single access truth |
| `core/api/__init__.py` | new | empty |
| `core/api/permissions.py` | new | `CanAccessTarget` etc., consume `can_access` only (§5.3) |
| `core/api/serializers.py` | new | `UserSerializer`, `RegisterSerializer`, `TrainerOptionSerializer` (§5.4a) |
| `core/api/views.py` | new | thin `RegisterView`, `TrainersView`, `LoginView`, `LogoutView`, `MeView` (§5.4) |
| `core/api/urls.py` | new | `/auth/register`, `/auth/trainers`, `/auth/login`, `/auth/logout`, `/auth/me` |
| `core/services/__init__.py` | new | placeholder package (P3/P4 fill) |
| `core/migrations/__init__.py` | new | empty; initial migration generated by `makemigrations` |
| `.env.example` | new | documents `SECRET_KEY`, `DATABASE_URL`, `DJANGO_SETTINGS_MODULE` (host-agnostic, Q5) |
| `.gitignore` | verify | already excludes `*.sqlite3`, `media/`, `.env` — confirm, no data files tracked (AC-6) |
| `README.md` | edit | replace 11-byte stub with run/setup instructions (venv, install, migrate, createsuperuser, runserver) |

No `CLAUDE.md` exists; creating one is **out of scope** for P1 (not an AC) — flag as optional follow-up.

---

## 7. Manual verification (no automated tests — epic §3)

Run locally, then confirm on prod config. Each step maps to an AC.

1. **Scaffold boots (AC-1).** `pip install -r requirements.txt`; `python manage.py makemigrations`;
   `python manage.py migrate` → creates the SQLite dev DB with `CustomUser`. `python manage.py runserver`
   starts with no errors.
2. **No data files tracked (AC-1, AC-6).** `git status` after migrate shows `db.sqlite3` untracked/ignored;
   `git check-ignore db.sqlite3 media/` returns both. Nothing under `media/` or `*.sqlite3` in `git ls-files`.
3. **User + roles + admin (AC-2).** `createsuperuser`; log into `/admin/`. (Trainers/trainees below are
   now made via open registration, step 3a — admin is only for the superuser + spot-checks.)
3a. **Open registration + trainer picker (AC-7, AC-8, §0).**
   - `curl /api/v1/auth/trainers` on a fresh DB → `[]` (no trainers yet).
   - Register a trainer: `POST /api/v1/auth/register {username, password, role:"trainer"}` → `201`
     `{id, username, role:"trainer"}` + session cookie set (auto-logged-in).
   - `GET /api/v1/auth/trainers` → now lists that trainer `{id, display_name}`.
   - Register a trainee picking that trainer: `POST /auth/register {username, password, role:"trainee",
     trainer_id:<id>}` → `201`, and in shell the trainee's `head_trainer_id` == the trainer's id.
   - Register a second trainer + its own trainee the same way (for the matrix in step 4).
   - Negative: `role:"admin"` → `400 invalid_role`; duplicate username → `400 username_taken`; weak
     password → `400 password_too_weak`; trainee with `trainer_id` pointing at a **trainee** → `400
     invalid_trainer`. All `detail` values are keys, not prose.
4. **`can_access` predicate (AC-2, AC-3) — the manual matrix (epic §5).** In `python manage.py shell`, call
   `caller.can_access(target)` for each row of the §2 table:
   - trainee → self = True; trainee → other = False.
   - trainer → own trainee = True; trainer → other trainer's trainee = False; trainer → self = True.
   - admin → anyone = True.
   Record the 200/403-equivalent True/False results; all must match §2.
5. **Login (AC-4, AC-5).** `curl -c cookies.txt -X POST /api/v1/auth/login -d '{"username":...,"password":...}'`
   → `200` + `{id, username, role}` + session cookie set. Wrong password → `401` with
   `{"detail":"invalid_credentials"}` (a key, not a prose sentence).
6. **Me (AC-5).** `curl -b cookies.txt /api/v1/auth/me` → `200` current user; also sets a `csrftoken` cookie.
   Without the session cookie → `403`/`401` (unauthenticated).
7. **Logout (AC-5).** `curl -b cookies.txt -X POST /api/v1/auth/logout` → `204`; a subsequent `/auth/me`
   with the old cookie is unauthenticated.
8. **Prod cookie flags (AC-4).** With `DJANGO_SETTINGS_MODULE=progresso.settings.prod` +
   `DATABASE_URL`/`SECRET_KEY`/`ALLOWED_HOSTS` set, `python manage.py check --deploy` reports secure +
   httpOnly session cookies and SSL redirect on (no critical warnings on the session/CSRF cookies).
9. **Host-agnostic (Q5).** Boot once against SQLite (unset `DATABASE_URL`) and once against a local Postgres
   via `DATABASE_URL` — same code, config-only switch.

---

## 8. Risks / notes

- `AUTH_USER_MODEL` must be set before the very first `migrate`. Greenfield, so safe — but do not run
  `migrate` before `user.py` + settings exist.
- Session auth + SPA needs CSRF handling; `MeView` seeding the `csrftoken` cookie is the P5 handshake point.
  Document it now so P5 doesn't re-invent it.
- `can_access` is defined once here; every later plan must import it, never re-implement a check. This is the
  epic's central invariant — call it out in the eventual `CLAUDE.md` (optional follow-up).

---

## 11. Open questions (proposals — confirm before implementing)

- **Q1 — RESOLVED (developer 2026-08-11): open self-registration.** P1 ships public `POST /auth/register`
  (choose role, trainee picks trainer at signup, auto-login) + `GET /auth/trainers`. Overrides the epic's
  trainer-creates-trainee model — see §0. Epic §5/§7/P7 to be reconciled later (flagged, not edited).
- **Q2 — RESOLVED (adopted).** `Role` = `TRAINEE`, `TRAINER`, `ADMIN`, `HELPER` (`TextChoices`); `HELPER`
  shape-only, no MVP grant. Admin = `role == ADMIN` **or** `is_superuser`.
- **Q3 — RESOLVED (adopted).** Add `helpers` M2M + dormant helper branch in `can_access` now (migration-free
  later), no live grant in MVP.
- **Q4 — RESOLVED (adopted).** Latest Django 5.x stable + current DRF; pin minors in `requirements.txt`.
- **Q5 — RESOLVED (deferred).** No `CLAUDE.md` in P1 (not an AC); add in P8 hardening or on request.

---

## 13. Post-Implementation notes (2026-08-11)

**Built:** the full Django 5.2 + DRF scaffold from a greenfield repo — `progresso/` project package with a
dev/prod settings split (env-driven, host-agnostic), `core/` layered app (`models/`, `api/`, `services/`),
`CustomUser` + `Role` hosting the single `can_access` predicate, `CanAccessTarget` permission class that
delegates to it, and the five session-auth endpoints (`register`, `trainers`, `login`, `logout`, `me`).
Initial migration `core/0001_initial.py` generated with `AUTH_USER_MODEL` set first. All 8 ACs verified by
hand against the running server (urllib driver, not a test suite) + a `manage.py shell` `can_access` matrix
(all 6 rows PASS). `check --deploy` on prod settings shows secure/httpOnly session + CSRF cookies and SSL
redirect on. `db.sqlite3` and `media/` confirmed gitignored and untracked.

**Implemented on `main`** (developer chose to stay on main; greenfield, no ticket).

**Verification note on CSRF:** DRF `SessionAuthentication` enforces CSRF only on *authenticated* unsafe
requests. Public register/login (anonymous) need no token; after auto-login, subsequent unsafe requests
(e.g. logout) require the `X-CSRFToken` header read from the `csrftoken` cookie `MeView` seeds. This is the
exact P5 SPA handshake — verified working (logout: 403 without token, 204 with).

**Follow-ups for the developer (not P1 scope):**
- **Epic reconciliation (from §0):** P7's `POST /api/v1/trainees` (trainer-creates-trainee) is redundant for
  onboarding now that signup is open. Epic §5/§7 and the P7 brief still describe trainer-created accounts —
  update them to reflect open self-registration. Flagged only; not edited (plan command edits this file only).
- **Built-in CSRF/auth failure bodies are English prose** (e.g. `"CSRF Failed: ..."`, `"Authentication
  credentials were not provided."`) — these come from Django/DRF, not our views. Our own error bodies are
  translation keys (`invalid_credentials`, `username_taken`, …). If P5 needs *every* backend message
  localized, add a DRF custom exception handler in P8 hardening.
- **HSTS not set** (`check --deploy` W004) — deferred to P8 security hardening, consistent with §3 scope.
- **No `CLAUDE.md`** (Q5 deferred). When added, document the "`can_access` is the only access authority —
  never re-implement a role check" invariant (§8).
- **Postgres host-agnostic switch** (§7.9) shown by `dj-database-url` parsing a `postgres://` `DATABASE_URL`
  under prod `check` with no code change; a live Postgres boot was not run (no local Postgres). Confirm on
  the real prod DB at P8 deploy.
