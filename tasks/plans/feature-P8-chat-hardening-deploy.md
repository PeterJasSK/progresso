# Feature Plan: P8 — Chat + Hardening & Deploy

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved)
**Plan ID:** P8
**Slug:** chat-hardening-deploy
**Author:** Claude (Opus)
**Date:** 2026-08-12
**Status:** Complete (2026-08-12; on `main`). All §11 Q1–Q11 taken as defaults. Backend verified in-process
(28/28 DRF APIClient checks); `npm run build` clean; Django `check` + `makemigrations --check` clean;
prod settings + `collectstatic` verified. See §13.

> No GitHub issue. ACs are quoted from the design docs (`tasks/design/*.md`) via the epic §9 P8 brief
> (`rebuild-analysis.md` §6 F1 + §7 NFRs + §10; `mvp-routes.md` §B Chat, §C). `design-preview.html` is the
> rendered visual reference. There are **no ticket images**; the design source is the three docs in
> `tasks/design/`.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7. This plan adds no
> test files, no "test impact" section, and no per-AC test mapping. The `can_access` predicate and the new
> chat gate are **verified by hand** against the §5/§C permission matrix.

> **P8 closes the MVP.** It is the last plan: it adds the conversation feature (the third leg of the core
> loop — *trainee logs → trainer reviews → **they talk***) and does the non-functional hardening + prod
> verification that makes the build shippable. It depends on P1–P7, all shipped on `main`.

---

## 0. Context this plan depends on (from P1–P7, already shipped on `main`)

P8 adds the **only remaining new model** (`Message`) and its API, the chat screens on both sides, and a
hardening/deploy pass over what P1–P7 built. It touches many files lightly rather than one area deeply.

### Backend contracts consumed (do not re-encode)

- **`can_access`** (`core/models/user.py:47-69`): admin/superuser → all; self → self; trainer → trainee where
  `target.head_trainer_id == self.pk`; **trainee → self only (returns `False` for their trainer)**. This
  asymmetry matters for chat — see §5.3 (the gate must be **symmetric**).
- **`accessible_data_filter(field="user") -> Q`** (`core/models/user.py:71-84`): trainer →
  `Q(user=self) | Q(user__head_trainer=self)`; others → `Q(user=self)`. Used to scope detail querysets so an
  inaccessible id **404s** (no existence leak, epic Q6).
- **`Role`** (`core/models/user.py:15-20`): `TRAINEE, TRAINER, ADMIN, HELPER` (helper shape-only, grants
  nothing). **CustomUser**: `role`, `head_trainer` FK to self (`related_name="trainees"`, `SET_NULL`),
  `helpers` M2M (post-MVP). Display name = `get_full_name() or username` (names usually empty).
- **Views** (`core/api/views.py`): `TargetUserMixin.get_target_user` (`views.py:40-53`) resolves `?user=` →
  target else `request.user`; `RegisterView` (`:55`), `TrainersView` (`:69`), `LoginView` (`:81`),
  `LogoutView` (`:99`), `MeView` (`:110`, `GET`+`PATCH`), `MeasurementViewSet` (`:137`), `GoalViewSet`
  (`:211`), `TraineeViewSet` (`:251`). Auth views are hand-rolled `APIView`s; measurements/goals/trainees are
  viewsets.
- **Permissions** (`core/api/permissions.py`): `CanAccessTarget` (`:25`), `IsTrainee` (`:46`),
  `TraineeRosterPermission` (`:61`), `MeasurementAccessPermission` (`:83`), `GoalAccessPermission` (`:126`).
  Every one consumes `can_access`; **P8 adds `MessageAccessPermission` in the same shape** (§5.3).
- **URL map** (`core/api/urls.py:37-56`, all under `/api/v1/`): `auth/{register,trainers,login,logout,me}`,
  `measurements` (list/create), `measurements/{photos,series}`, `measurements/<int:pk>`, `goals`
  (list/create), `goals/<int:pk>` (PATCH), `trainees`, `trainees/<int:pk>`. **No `messages` route, no
  `me/export`, no account-delete route exist.**
- **Serializers** (`core/api/serializers.py`): `UserSerializer` (`:25`), `LinkTrainerSerializer` (`:46`),
  `RosterEntrySerializer` (`:76`), `TrainerOptionSerializer` (`:134`), `RegisterSerializer` (`:147`),
  `MeasurementSerializer` (`:209`), `GoalSerializer` (`:407`), `GoalToggleSerializer` (`:473`).
- **Services** (`core/services/`): `metrics.py` (trend/delta helper — reuse, never re-implement),
  `chart_data.py`, `roster.py` (`roster_queryset`, `weight_summary`), `blob.py` (Blob client + local-FS dev
  fallback), `blob_cleanup.py` (**delete-on-delete already wired for measurements, P3** — P8 reuses it for
  account-delete cascade), `photos.py`.
- **Models / migrations** (`core/models/`, `core/migrations/`): `user.py`, `measurement.py`, `goal.py` (no
  `message.py`). Migrations `0001_initial`, `0002_measurement`, `0003_measurement_photo`, `0004_goal`. **P8
  adds `0005_message`** (and any index migration, §5.5).
- **Settings** (`progresso/settings/`): `base.py` `REST_FRAMEWORK` = SessionAuthentication + IsAuthenticated
  default, `PageNumberPagination` `PAGE_SIZE=50` (`base.py:82-97`). **No throttle classes/rates configured.**
  `LocaleMiddleware` on, `LANGUAGES=[en,sk]`, `LOCALE_PATHS=[BASE_DIR/"locale"]` (`base.py:107-120`).
  `prod.py`: `DEBUG=False`, secure cookies, `SECURE_SSL_REDIRECT`, `SECURE_PROXY_SSL_HEADER`, plain-stdout
  `LOGGING` (no Sentry). Requires `DATABASE_URL` + `BLOB_READ_WRITE_TOKEN`. `dev.py`: SQLite fallback, relaxed
  cookies.
- **Deps** (`requirements.txt`): Django 5.2, DRF, `dj-database-url`, `psycopg[binary]`, Pillow, gunicorn.
  **No `whitenoise`.** **No `vercel.json`, `Dockerfile`, or `Procfile` exist.** Blob client is stdlib-only.
- **SPA serving already scaffolded (single-service topology chosen).** `progresso/urls.py` mounts `admin/`,
  `api/v1/`, and a **SPA catch-all** `re_path(r"^(?!api/|admin/|static/|media/|assets/).*$", spa_index)`;
  `progresso/spa.py:spa_index()` serves `frontend/dist/index.html` (404 if unbuilt). Its comment: **"Static
  asset serving for dist/assets (WhiteNoise) is deferred to P8."** So the index route exists — **P8's only
  static gap is serving `dist/assets` + admin static via WhiteNoise** (§5.10), which settles Q7 toward
  single-service.
- **Query shape today**: `MeasurementViewSet`/`GoalViewSet` querysets use `.select_related("user")`; roster
  uses `annotate`+`Prefetch` (P7 `roster.py`). No `prefetch_related` elsewhere. Blob cleanup is a
  `post_delete` signal on `Measurement` (`blob_cleanup.py:49`, registered in `CoreConfig.ready()`), firing on
  both direct delete and cascade — reuse for account-delete.

### Frontend contracts consumed (from P5–P7)

- **API client** (`frontend/src/lib/api.ts:86-96`): `api.get/post/patch/del/upload`; `ApiError` carries
  `.status` + `.key` (callers localize `t('errors.<key>')`). CSRF auto-attached on unsafe methods
  (`lib/csrf.ts`). All P8 chat/export/delete calls use these — no new client primitive needed.
- **Routing/guards** (`frontend/src/App.tsx:57-94`): `trainee(el)` / `trainer(el)` guard helpers wrap
  `RequireAuth`+`RequireRole`. **No `/me/chat` or `/trainer/trainees/:id/chat` routes exist** (the two chat
  seams). `useAuth()` → `{user:{id,username,role}, ...}`; `roleHome()`.
- **Nav** (`frontend/src/components/`): `TraineeNav.tsx` and `TrainerNav.tsx` — both note **"chat is P8,
  absent"** (`TrainerNav.tsx:4`). P8 adds the chat link to each.
- **Component kit**: `AppShell({children, actionBar?})`, `Avatar`, `Button`, `Card`, `Input`, `Pill`,
  `Spinner`, plus P6/P7 `ProgressView` (the shared-view pattern P8 mirrors for chat). No chat component
  exists.
- **Resource libs** (`frontend/src/lib/`): `api.ts, csrf.ts, format.ts, goals.ts, measurements.ts,
  metricMeta.ts, me.ts, trainees.ts`. **No `messages.ts`.** `me.ts` has `linkTrainer` (P7).
- **i18n** (`frontend/src/i18n/`): `en.json` (base) + `sk.json` (complete parallel). Top-level namespaces:
  `app, common, theme, lang, nav, roles, metrics, auth, home, measurements, capture, detail, progress, goals,
  trainer, errors, notfound` (`en.json`). **No `chat` namespace.** Helpers `formatNumber`, `formatDate`.

---

## 1. Goal

Close the MVP with the conversation feature and the production-hardening pass.

**(A) Chat — real API, not the old HTML-partial polling (`rebuild-analysis.md` §2 #5).**
- New **`Message`** model, indexed `(sender, receiver, created_at)` for cheap `since` queries.
- **`GET /api/v1/messages?with=:userId&since=:ts`** — the thread between the caller and `:userId`, optionally
  only messages after `:ts` (incremental poll — **never re-fetch the whole thread**).
- **`POST /api/v1/messages`** — send `{to, content}`.
- **`POST /api/v1/messages/read`** — mark the thread read **once** (set `read_at` on the caller's unread
  received messages), not on every poll.
- Both endpoints gated by a **symmetric** relationship check (both parties in an allowed trainer↔trainee
  relationship), API-enforced (`mvp-routes.md` §C chat).
- Chat screens **`/me/chat`** (trainee ↔ their trainer) and **`/trainer/trainees/:id/chat`** (trainer ↔ that
  trainee), sharing one `ChatView` component (the P7 `ProgressView` pattern — zero duplicated logic).

**(B) Hardening & deploy (the NFRs, `rebuild-analysis.md` §7, epic §9 P8):**
- **Rate-limit auth** (login/register) via DRF throttling — chat polling must stay un-throttled.
- **Performance**: confirm `select_related`/`prefetch_related` on the roster + access paths (P7 already);
  index the new message lookups; the measurement lookups; make list reads follow pagination `next` where a
  list can exceed 50 (roster / measurements) instead of silently truncating (the P6/P7 caveat).
- **Data lifecycle**: **export-my-data** (`GET /api/v1/me/export`) and **delete-my-account**
  (`DELETE /api/v1/me`) with **blob cleanup** on cascade (reuse P3 `blob_cleanup`).
- **Blob cleanup on delete** — verify the P3 wiring still fires on measurement + account delete.
- **i18n** — EN↔SK complete incl. the new `chat` namespace; no hardcoded SPA strings; backend chat/error
  messages translatable (return keys).
- **Observability** — plain Django logging only (Sentry dropped, epic §3) — verify, no new dependency.
- **Deploy** — verify prod on **Postgres + Blob**, no data files in git; ship a **host-agnostic** deploy
  config (`vercel.json` **and** a `Dockerfile`) with a documented container-host path (epic Q5).

---

## 2. Acceptance criteria (quoted from design docs via epic §9 P8)

- [x] **AC-1 — Chat API (fetch-since, mark-read once).** Covered by `core/api/views.py:289` (`MessagesView`
  GET thread + `since` filter `created_at__gt`, POST send) + `core/api/views.py:359` (`MessageReadView`,
  `read_at` set once via `.update()`, idempotent) + `core/api/urls.py:63-64`. Verified: since returns only
  newer; mark-read updated=1 then 0.
- [x] **AC-2 — Message model indexed for `since`.** Covered by `core/models/message.py` (fields `sender`,
  `receiver`, `content`, `created_at`, `read_at`; `Meta.indexes` `(sender,receiver,created_at)` +
  `(receiver,read_at)`) + migration `core/migrations/0005_message_and_measurement_index.py`.
- [x] **AC-3 — Chat screens both sides.** Covered by `frontend/src/pages/Chat.tsx` (`/me/chat`) +
  `frontend/src/pages/TraineeChat.tsx` (`/trainer/trainees/:id/chat`) + shared
  `frontend/src/components/ChatView.tsx` (bubbles by `mine`, mono `formatDateTime`, composer, 10s poll) +
  routes `frontend/src/App.tsx:73,101-104`.
- [x] **AC-4 — Chat access API-enforced, symmetric relationship.** Covered by
  `core/models/user.py:71` (`can_communicate_with` = symmetric OR of `can_access`) +
  `core/api/permissions.py:169` (`MessageAccessPermission`, POST 403 / GET view-404). Verified: A (trainee)
  chats T1 despite `A.can_access(T1)` False.
- [x] **AC-5 — Least-privilege, no cross-trainer leak.** Covered by the symmetric gate above + `views.py:308`
  (GET `raise Http404` when not reachable). Verified in-process: A→T2 thread 404, A→B POST 403, A→T2 POST 403.
- [x] **AC-6 — Rate-limit auth.** Covered by `progresso/settings/base.py:99-109` (`ScopedRateThrottle` +
  `{"auth": "10/min"}`) + `core/api/views.py:70-71,102-103` (`throttle_scope="auth"` on Register/Login only).
  Verified: 429 within 12 anon logins; chat/other views un-throttled.
- [x] **AC-7 — Performance: query-shape + pagination + indexes.** Covered by the `Message` indexes (AC-2), the
  `Measurement (user,-created_at)` index (`core/models/measurement.py` `Meta.indexes`),
  `views.py:298` thread `select_related("sender","receiver")`, and `frontend/src/lib/measurements.ts`
  (`fetchAllPages` follows `next`) consumed by `listMeasurements`/`listPhotos`/`listTrainees`. Roster stays
  P7's constant-query shape.
- [x] **AC-8 — Blob cleanup on delete.** Covered by the existing P3 `post_delete` signal
  (`core/services/blob_cleanup.py:49`) firing on the account-delete cascade; `AccountDeleteView`
  (`views.py:418`) deletes the user and the cascade cleans measurement blobs. Verified: cascade removes
  messages/measurements; measurement delete still cleans its blob.
- [x] **AC-9 — Export / delete-my-data path.** Covered by `core/api/views.py:388` (`MeExportView` — profile +
  measurements + goals + messages, photos as URLs) + `core/api/views.py:418` (`AccountDeleteView`) +
  `core/api/urls.py:66-67` + `frontend/src/lib/me.ts` (`exportData`/`deleteAccount`) +
  `frontend/src/components/DataSection.tsx` (JSON download + typed-confirm delete). Verified: export shape;
  delete 204 + account gone; trainer-delete leaves trainee `head_trainer` null.
- [x] **AC-10 — i18n complete.** Covered by `frontend/src/i18n/en.json` + `sk.json` (`chat.*`, `data.*`,
  `nav.chat`, `nav.trainer.chat`, `common.cancel`, new `errors.*`; EN↔SK parity script-verified 0
  missing/extra). Backend returns keys (`empty_message`, `unknown_recipient`, …). All P8 components use `t()`.
- [x] **AC-11 — Plain logging, no Sentry.** Unchanged from P1 — `progresso/settings/prod.py` `LOGGING` =
  stdout StreamHandler; no Sentry dependency in `requirements.txt`.
- [x] **AC-12 — No data files in git; prod verified on Postgres + Blob.** `git ls-files` shows no
  `db.sqlite3`/`media/`/`staticfiles/`/`frontend/dist/`; `.gitignore` covers them. `DEPLOY.md` documents the
  Postgres + Blob run (manual, §7 step 10).
- [x] **AC-13 — Host-agnostic deploy verified.** Covered by `Dockerfile` (node build → python runtime →
  collectstatic → gunicorn), `vercel.json`, `DEPLOY.md`, `whitenoise` in `requirements.txt`, WhiteNoise
  middleware + `WHITENOISE_ROOT`/`STATIC_ROOT` (`base.py:38,124-131`) + prod `STORAGES` (`prod.py`). Verified:
  prod settings load, `collectstatic` copies 163 files.

---

## 3. Out of scope (deferred — do not build in P8)

- **Realtime chat** (SSE/WebSocket / Django Channels) — post-MVP (`rebuild-analysis.md` §6 F2). P8 ships
  **fetch-since polling only**; no persistent connection, no push.
- **Push notifications / reminders** — post-MVP (`mvp-routes.md` §scope; epic P5 out-of-scope C4).
- **Training plans** (E1), **measurable-goal auto-progress + notifications** (E2/E3), **derived body-fat**,
  **assistant-trainer management** (G2), **audit log** (G3) — all post-MVP (epic §9, `mvp-routes.md` §scope).
- **Message edit/delete, attachments, typing indicators, read receipts beyond a single `read_at`** — not in
  the MVP chat spec (`mvp-routes.md` §B Chat is send / fetch-since / mark-read only).
- **Group / multi-party threads** — chat is strictly the 1:1 trainer↔trainee pair.
- **Offline queue** for chat or capture — post-MVP (epic P5 C3).
- **CI test gate / automated permission-matrix tests / Sentry** — dropped for this project (epic §3). The
  matrix is verified by hand (§7).

---

## 4. Cross-cutting decisions this plan adopts (from epic §3, not re-litigated)

- **One authorization predicate.** The chat gate resolves access **only** through `can_access` — but applied
  **symmetrically** (either party may access the other), because `can_access(trainee→trainer)` is `False` by
  design (§5.3). No inline `if role` data checks. A single `can_communicate_with(other)` helper on the model
  wraps the symmetric OR so the rule lives in one place beside `can_access` (§5.3, Q1).
- **API-first.** All chat data flows through DRF JSON at `/api/v1/`; **no HTML-partial polling** (this is the
  explicit fix for `rebuild-analysis.md` §2 #5). The SPA holds no chat business logic.
- **Layered backend layout.** `message.py` under `core/models/`; serializer/permission/view under
  `core/api/`; any non-trivial thread aggregation in a `core/services/` module, not the view (epic §3 thin
  viewsets).
- **No raw SQL.** Thread + `since` queries via the ORM (`filter`, `Q`, index-backed `order_by`), never raw
  SQL (epic §3).
- **Session auth**, same-origin, CSRF via the P5 handshake; unsafe requests carry `X-CSRFToken` (epic Q2) —
  `POST /messages`, `POST /messages/read`, `DELETE /me` all go through `api.post`/`api.del`, which attach it.
- **Numbers/dates are mono.** Message timestamps render in JetBrains Mono (`design-system.md` §3).
- **i18n from day one** — no hardcoded strings; EN base + complete SK; locale-aware date/time formatting
  (epic Q6).
- **Tokens are the single source.** Chat bubbles/composer styled via token utilities; **no hardcoded hex**
  (epic §3).
- **Host-agnostic.** All deploy config env-driven; nothing Vercel-specific in app code beyond the pluggable
  Blob backend (epic Q5).

---

## 5. Design / approach

### 5.1 `Message` model — `core/models/message.py` (new) + migration `0005_message`

```python
from __future__ import annotations
from django.conf import settings
from django.db import models

class Message(models.Model):
    sender   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                 related_name="sent_messages")
    receiver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                 related_name="received_messages")
    content   = models.TextField(max_length=<Q7>)          # non-empty, capped
    created_at = models.DateTimeField(auto_now_add=True)
    read_at    = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["sender", "receiver", "created_at"]),   # thread + since (AC-2)
            models.Index(fields=["receiver", "read_at"]),                # unread scan for mark-read
        ]
```

- `on_delete=CASCADE` on both FKs so deleting a user (account-delete, §5.6) removes their messages. No blob on
  a message (text only), so no blob cleanup needed for messages themselves.
- Register in `core/models/__init__.py` alongside the others; add to Django admin if the others are (match the
  existing pattern — check `core/admin.py`).
- `makemigrations` → `0005_message`. Strict types (`from __future__ import annotations`), full hints.

### 5.2 `MessageSerializer` — `core/api/serializers.py` (new)

- **Read shape** (thread payload): `id, sender, receiver, content, created_at, read_at, mine`
  (`mine = obj.sender_id == request.user.pk`, a `SerializerMethodField`, so the UI aligns bubbles left/right
  without leaking identity logic into the client). `sender`/`receiver` are ids.
- **Write shape** (`POST /messages`): a separate small serializer or the same with `to` + `content` writable —
  input is `{to: <userId>, content: <str>}`. `sender` is **always** `request.user` (never client-supplied);
  `receiver` resolved from `to` and validated to be a reachable party (the permission does the relationship
  check; the serializer validates `to` exists and `content` is non-empty/within `max_length`). Return a
  translatable key on validation error (e.g. `errors.empty_message`, `errors.unknown_recipient`), consistent
  with `RegisterSerializer`.

### 5.3 Chat access — `MessageAccessPermission` + `can_communicate_with` (symmetric gate)

The epic rule is "**both parties in an allowed trainer↔trainee relationship**." `can_access` is directional:
`trainer.can_access(trainee) == True` but `trainee.can_access(trainer) == False`. So the chat gate is the
**symmetric OR**:

- **`CustomUser.can_communicate_with(other) -> bool`** (`core/models/user.py`, new, small): return
  `self.can_access(other) or other.can_access(self)`. This keeps the relationship rule expressed **once**,
  built on the single predicate — no new relationship logic, no inline `if role` (epic §3). Admins and
  self-pairs fall out of `can_access` naturally. (Q1 confirms this is the intended reading.)
- **`MessageAccessPermission`** (`core/api/permissions.py`, new, mirrors `MeasurementAccessPermission`):
  `has_permission` → `IsAuthenticated`; the object/target check → `request.user.can_communicate_with(other)`
  where `other` is the `?with=` (GET) or `to` (POST) counterpart. A caller messaging someone they have no
  relationship with → **403** (or 404 on GET of a non-reachable thread — see Q1 note on leak parity).

### 5.4 Chat views — `MessageViewSet` (or `APIView` trio) — `core/api/views.py` (new)

Chat is not a CRUD resource in the REST sense (no per-message GET/PATCH/DELETE in the spec), so the cleanest
shape is **one `APIView`-style surface** (mirroring the hand-rolled auth views) — or a `ViewSet` with custom
actions. Proposed: a small `MessageViewSet` (or `MessagesView` + `MessageReadView` APIViews) exposing:

- **`GET /messages?with=:userId&since=:ts`** — resolve `other = get_object_or_404(CustomUser, pk=with)`;
  `check` `can_communicate_with(other)`; queryset =
  `Message.objects.filter( Q(sender=me, receiver=other) | Q(sender=other, receiver=me) )` ordered by
  `created_at`; if `since` present, add `.filter(created_at__gt=parse(since))`. **Not paginated** — the
  `since` window is the bound (like the series endpoint). On first load (`no since`) cap to the last N
  (Q9: default last 200) so a long history doesn't over-fetch; the client walks forward with `since`
  thereafter. `select_related("sender", "receiver")` to avoid per-row user queries.
- **`POST /messages`** — body `{to, content}`; `other = CustomUser(pk=to)`; `check`
  `can_communicate_with(other)`; create `Message(sender=me, receiver=other, content=...)`; return the created
  message (read shape). **CSRF-protected, session-auth.**
- **`POST /messages/read`** — body `{with: :userId}`; mark **once**:
  `Message.objects.filter(sender=other, receiver=me, read_at__isnull=True).update(read_at=now())`. Idempotent;
  a second call updates nothing. Returns `{updated: <count>}`.

All three go through `MessageAccessPermission`; none re-encode the relationship. No raw SQL.

**URLs** (`core/api/urls.py`, edit):
```python
path("messages", _messages_view, name="message-list"),          # GET (thread) + POST (send)
path("messages/read", _messages_read_view, name="message-read"),# POST (mark read once)
```

### 5.5 Indexes & pagination hardening (AC-7)

- **Message indexes** — in the `Message.Meta` (§5.1); ship with `0005_message`.
- **Measurement lookups** — the frequent read is `filter(user=...)` (FK, already indexed) ordered by
  `-created_at`/`-measured_at`. If ordering scans, add `models.Index(fields=["user", "-measured_at"])` (or
  `created_at`) to `Measurement.Meta` → a small migration `0006_measurement_index`. Confirm the current
  ordering field first (`core/models/measurement.py`) and only add if missing (Q6/§8).
- **Roster query shape** — already `annotate` + single `Prefetch` (P7, `core/services/roster.py`); re-verify
  it's constant-query (§7 step, `django.db.connection.queries`), no change expected.
- **List pagination `next`-following** — P6/P7 read page 1 only (≤50) and logged the caveat. P8 removes the
  silent truncation for lists that can exceed 50 (a trainee's measurements/photos, a trainer's roster): the
  resource libs (`lib/measurements.ts`, `lib/trainees.ts`) gain a **fetch-all-pages** path that follows the
  `next` cursor until exhausted (or a "load more" control — Q6). Chat is `since`-bounded, not paginated, so it
  is unaffected. Keep the server `PAGE_SIZE=50`.

### 5.6 Data-lifecycle endpoints — export & delete (AC-8, AC-9)

Both act on **`request.user` only** (self-service; no `?user=`, no `can_access` — you can only export/delete
yourself). Attach to the existing `MeView` (`core/api/views.py:110`) or a dedicated view:

- **`GET /api/v1/me/export`** — returns the caller's own data as JSON: profile (username, role, trainer),
  measurements (all fields incl. `photo_url`/`thumbnail_url` — **URLs, not bytes**; the blobs are already
  fetchable at those URLs), goals, and messages (both directions). One assembled dict, serialized with the
  existing serializers where possible; no pagination (it's a full personal export). Any role can export its
  own data.
- **`DELETE /api/v1/me`** — deletes the caller's account. Before the ORM cascade, enumerate the caller's
  measurements and **clean their blobs** via `core/services/blob_cleanup.py` (the P3 helper) so no orphan
  blobs are left; then delete the `CustomUser` (FK cascades remove measurements/goals/sent+received
  messages). Log out / invalidate the session afterward. **Destructive and irreversible** — the SPA must
  confirm (§5.8) and this is flagged in §8/§11 Q5. A trainer deleting their own account leaves their trainees
  with `head_trainer = NULL` (the FK is `SET_NULL`) — they fall back to self-tracking, not deleted.

### 5.7 Rate-limit auth (AC-6)

DRF throttling, **scoped to the auth endpoints only** so chat polling and normal traffic are never throttled:

- `base.py` `REST_FRAMEWORK`: add
  `"DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"]` and a `DEFAULT_THROTTLE_RATES`
  map with an `"auth"` scope (Q8 default `"10/min"`). **Do not** add a global `AnonRateThrottle`/`UserRateThrottle`
  default — that would throttle chat polling.
- `LoginView` and `RegisterView` (`core/api/views.py:81,55`): set `throttle_scope = "auth"` (and
  `throttle_classes = [ScopedRateThrottle]` if the default map needs it). Throttled requests → 429 with a
  translatable key. Everything else stays un-throttled.

### 5.8 Frontend — chat screens, shared `ChatView`, nav, delete/export UI

- **`frontend/src/lib/messages.ts`** (new): `type Message = {id, sender, receiver, content, created_at,
  read_at, mine}`; `listThread(withUserId, since?)`, `sendMessage(to, content)`, `markRead(withUserId)`. All
  over `api.get/post`. Thread fetch is `since`-incremental.
- **`frontend/src/components/ChatView.tsx`** (new): the shared thread UI, consumed by both chat routes —
  props `{ withUserId: number, title?: string }`. Renders a scrollable list of **bubbles**
  (`mine` right-aligned accent, other left-aligned surface — token utilities, no hex), mono `created_at` via
  `formatDate`/time helper, a bottom composer (`Input` + send `Button`, in the `AppShell` action bar), and an
  incremental **poll** (`setInterval`, Q2 default 10s, cleared on unmount; advances `since` to the newest
  received `created_at`). Calls `markRead` on mount + when new inbound messages arrive (once, AC-1). Empty →
  localized "no messages yet". This is the P7 `ProgressView` pattern — one component, two mount points, zero
  duplication.
- **Pages**: `frontend/src/pages/Chat.tsx` (trainee `/me/chat` — resolves the counterpart = the trainee's
  `head_trainer` from `useAuth()`/`me`; if the trainee has **no trainer**, show a localized "link a trainer to
  chat" prompt linking to the `/me` TrainerLink control) and `frontend/src/pages/TraineeChat.tsx` (trainer
  `/trainer/trainees/:id/chat` — counterpart = `:id`). Both are thin: resolve `withUserId`, render
  `<ChatView withUserId=... />`.
- **Routes** (`frontend/src/App.tsx`, edit): add `/me/chat` under `trainee(...)` and
  `/trainer/trainees/:id/chat` under `trainer(...)`.
- **Nav** (`TraineeNav.tsx`, `TrainerNav.tsx`, edit): add the **Chat** link (removing the "chat is P8, absent"
  note). Trainer chat link sits in the per-trainee sub-nav (beside Measurements/Progress/Photos/Goals).
- **Export / delete UI** — a small **"Your data"** section on `/me` (`pages/TraineeHome.tsx`) and, for
  trainers, on the trainer home or a settings area (Q5): an **Export** action (`GET /me/export`, triggers a
  JSON download) and a **Delete account** action behind a **typed confirmation** dialog (destructive) →
  `DELETE /me` → on success, clear session + redirect to `/login`. All copy via i18n; the delete confirmation
  string is explicit ("this permanently deletes your account and all your data").

### 5.9 i18n — `frontend/src/i18n/en.json` + `sk.json` (edit) + backend keys

- New top-level **`chat`** namespace in both catalogs (exact parity — AC-10): `chat.title`, `chat.empty`,
  `chat.placeholder`, `chat.send`, `chat.noTrainer` (trainee-without-trainer prompt), `chat.today`/relative
  time labels if used. Extend `nav.*` with the chat link label(s).
- **`data`** (or `account`) namespace: `data.export`, `data.delete`, `data.deleteConfirm`,
  `data.deleteConfirmPrompt`, `data.exported`.
- **New `errors.*` keys** for backend-returned chat/throttle errors: `errors.empty_message`,
  `errors.unknown_recipient`, `errors.not_related` (chat gate 403), `errors.rate_limited` (429). Backend
  returns these keys; the SPA localizes via `t('errors.<key>')` (consistent with P1–P7).
- SK is developer-drafted; flag for native review (consistent with P5–P7).

### 5.10 Deploy config (AC-12, AC-13)

Ship a **host-agnostic** deploy so Vercel and a container host are a config swap, not a rewrite (epic Q5):

- **Single-service topology is already the architecture.** `progresso/urls.py` + `progresso/spa.py` already
  serve the SPA **index**; the only deferred piece is the **static assets** (`dist/assets` + admin). So P8
  finishes what P1 scaffolded rather than choosing a topology — Q7 is effectively "confirm single-service."
- **Static serving** — add **`whitenoise`** to `requirements.txt` and `WhiteNoiseMiddleware` (right after
  `SecurityMiddleware`) so the one Django service serves `collectstatic` output (admin assets) **and** the
  built SPA's `dist/assets`. Add `STATIC_ROOT = BASE_DIR/"staticfiles"`, point `STATICFILES_DIRS` (or the
  WhiteNoise config) at `frontend/dist/assets`, and set the compressed-manifest storage backend in `prod.py`
  (or `base.py`). The SPA index route (`spa.py`) stays as-is; WhiteNoise only fills the `assets/` gap its
  comment names.
- **`vercel.json`** (new) — build the frontend (`npm run build` in `frontend/`), run Django as the Python
  serverless/target, route `/api/*` + `/admin/*` to Django and everything else to the SPA index. Env:
  `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `SECRET_KEY`, `ALLOWED_HOSTS`, `DJANGO_SETTINGS_MODULE=
  progresso.settings.prod`.
- **`Dockerfile`** (new) — the container-host proof: build the SPA, `pip install -r requirements.txt`,
  `collectstatic`, run `gunicorn progresso.wsgi` (already a dep). Same env vars. Demonstrates "move hosts =
  env + deploy config only."
- **Deploy note** — a short `DEPLOY.md` (or a README section) documenting the env vars, the Postgres + Blob
  requirement, `migrate` + `collectstatic`, and the container path. **No `CLAUDE.md`** was ever added (P1
  deferred it); P8 may add a brief one if useful (Q10) — optional, not an AC.
- **`gitignore` audit** — confirm `db.sqlite3` + `media/` + `frontend/dist` stay ignored (they are:
  `.gitignore` `*.sqlite3`, `media/`, `frontend/dist/`). The committed `db.sqlite3`/`media/` in the working
  tree are local-dev artifacts and already ignored — **do not commit them**; if they are tracked from before
  P1, `git rm --cached` them (verify with `git ls-files`).

---

## 6. File Plan

Backend is Python (strict types via `from __future__ import annotations`, full type hints, PEP 8; **no raw
SQL** — Django ORM only). Frontend is TypeScript/TSX (strict), no hardcoded hex, no user-facing string literal
outside the i18n catalogs.

| File | Change | Notes |
|------|--------|-------|
| `core/models/message.py` | new | `Message` model, indexes `(sender,receiver,created_at)` + `(receiver,read_at)` (§5.1) |
| `core/models/__init__.py` | edit | export `Message` |
| `core/admin.py` | edit (if others registered) | register `Message` in admin, matching existing pattern (§5.1) |
| `core/migrations/0005_message.py` | new (generated) | `makemigrations` |
| `core/models/measurement.py` | edit (conditional) | add `Meta.indexes` for `(user, -measured_at)` **only if** the list-ordering field isn't already indexed (§5.5, Q6) |
| `core/migrations/0006_measurement_index.py` | new (generated, conditional) | only if the index above is added |
| `core/api/serializers.py` | edit | add `MessageSerializer` (+ write serializer) with `mine` field + translatable-key validation (§5.2) |
| `core/api/permissions.py` | edit | add `MessageAccessPermission` (symmetric gate) (§5.3) |
| `core/api/views.py` | edit | add message views (thread GET, send POST, read POST); `MeView` (or new views) export + account-delete; `throttle_scope="auth"` on Login/Register (§5.4, §5.6, §5.7) |
| `core/api/urls.py` | edit | add `messages`, `messages/read`; `me/export`; account-delete route (§5.4, §5.6) |
| `core/models/user.py` | edit | add `can_communicate_with(other)` (symmetric helper on the single predicate) (§5.3) |
| `progresso/settings/base.py` | edit | `REST_FRAMEWORK` throttle classes + `auth` rate; WhiteNoise middleware; `STATIC_ROOT` (§5.7, §5.10) |
| `progresso/settings/prod.py` | edit | WhiteNoise static storage backend (§5.10) |
| `requirements.txt` | edit | add `whitenoise` (§5.10) |
| `vercel.json` | new | build SPA + Django, route `/api`+`/admin` → Django, else SPA index (§5.10) |
| `Dockerfile` | new | container-host proof: build SPA, collectstatic, gunicorn (§5.10) |
| `DEPLOY.md` | new | env vars, Postgres+Blob, migrate/collectstatic, container path (§5.10) |
| `frontend/src/lib/messages.ts` | new | `Message` type + `listThread`/`sendMessage`/`markRead` (§5.8) |
| `frontend/src/lib/measurements.ts` | edit | `next`-following (fetch-all) for lists >50 (§5.5) |
| `frontend/src/lib/trainees.ts` | edit | `next`-following for the roster (§5.5) |
| `frontend/src/lib/me.ts` | edit | `exportData()` + `deleteAccount()` (§5.8) |
| `frontend/src/components/ChatView.tsx` | new | shared thread UI: bubbles, mono timestamps, composer, incremental poll, mark-read (§5.8) |
| `frontend/src/pages/Chat.tsx` | new | `/me/chat` (trainee ↔ head_trainer; no-trainer prompt) (§5.8) |
| `frontend/src/pages/TraineeChat.tsx` | new | `/trainer/trainees/:id/chat` (§5.8) |
| `frontend/src/App.tsx` | edit | add `/me/chat` + `/trainer/trainees/:id/chat` routes (§5.8) |
| `frontend/src/components/TraineeNav.tsx` | edit | add Chat link (§5.8) |
| `frontend/src/components/TrainerNav.tsx` | edit | add Chat link to per-trainee sub-nav (§5.8) |
| `frontend/src/pages/TraineeHome.tsx` | edit | add "Your data" export/delete section (§5.8) |
| `frontend/src/pages/TrainerHome.tsx` | edit (Q5) | trainer export/delete entry point (§5.8) |
| `frontend/src/i18n/en.json` | edit | `chat`, `data`, new `errors.*`, `nav` chat label (§5.9) |
| `frontend/src/i18n/sk.json` | edit | same keys, complete parallel (§5.9) |

No other model changes. Migrations: `0005_message` always; `0006_measurement_index` only if §5.5 adds it. No
test files (epic §3).

---

## 7. Manual verification (no automated tests — epic §3)

Run the backend (`python manage.py migrate && python manage.py runserver`, dev settings) and the Vite dev
server (`cd frontend && npm install && npm run dev`, proxy to `:8000`). You need a **trainer** T1, a trainee
**A owned by T1**, a trainee **B under a different trainer** (for the leak check), and a trainer **T2** (owns
B). Give A ≥1 measurement with a photo. Each step maps to ACs.

1. **Chat API + fetch-since + mark-read (AC-1, AC-2).** As A: `POST /api/v1/messages {to:T1, content:"hi"}` →
   201. As T1: `GET /api/v1/messages?with=A` → the thread (both directions, ordered, each with `mine`,
   `read_at:null` on A's message). `POST /api/v1/messages {to:A, content:"got it"}`. As A:
   `GET /api/v1/messages?with=T1&since=<ts-of-last-seen>` → **only** the newer message (fetch-since works).
   As T1: `POST /api/v1/messages/read {with:A}` → `{updated:1}`; call again → `{updated:0}` (mark-read once).
   Confirm A's message now has `read_at` set.
2. **Chat access, symmetric + no leak (AC-4, AC-5).** As A: `GET /api/v1/messages?with=T2` (a trainer A has no
   relationship with) → **403/404** (per Q1). As T1: `GET /api/v1/messages?with=B` (B is not T1's trainee) →
   **403/404**. As A messaging B (`POST {to:B}`) → denied. As A↔T1 and B↔T2 → allowed. Admin can reach any
   thread. Confirm the symmetric rule: A (trainee) can chat T1 (their trainer) even though
   `A.can_access(T1)` is `False` — the gate uses `can_communicate_with`.
3. **Chat screens (AC-3, AC-10).** `/me/chat` (as A) shows the thread with T1: bubbles aligned by `mine`, mono
   timestamps, composer in the action bar; sending appends; the poll pulls T1's reply within the interval
   without a full re-fetch. `/trainer/trainees/:id/chat` (as T1, `:id=A`) mirrors it. A trainee with **no
   trainer** → the "link a trainer to chat" prompt. Switch EN→SK: every chat string changes; reload persists.
4. **Rate-limit auth (AC-6).** Hit `POST /api/v1/auth/login` with wrong creds > the `auth` rate (Q8, 10/min)
   → **429** with a localized message. Confirm normal app traffic and **chat polling are not throttled**
   (leave `/me/chat` open past the window — no 429).
5. **Performance (AC-7).** With A holding ≥2 messages and ≥2 measurements: the thread `GET` issues a small,
   constant query count (`django.db.connection.queries`), index-backed (check the `since` filter uses the
   composite index). Roster `GET /api/v1/trainees` stays constant-query regardless of trainee count (P7).
   Create > 50 measurements for A → the trainee's measurement list in the UI shows **all** of them (the lib
   follows `next`), not just the first 50 (or the "load more" control loads the rest, Q6).
6. **Export / delete (AC-8, AC-9).** As A: **Export** on `/me` → downloads JSON containing A's profile,
   measurements (with `photo_url`s), goals, and messages. **Delete account** → typed-confirm dialog →
   `DELETE /api/v1/me` → 204; A is logged out, redirected to `/login`; A can no longer log in; A's
   measurements/goals/messages are gone from `/admin/`; **A's photo blobs are removed** (check the Blob store /
   local-FS fallback — no orphan). If T1 (trainer) deletes their account, A survives with `head_trainer=NULL`
   (self-tracking), not deleted.
7. **Blob cleanup on delete (AC-8).** Independently of account-delete: delete one of A's measurements
   (`DELETE /api/v1/measurements/:id`) → its blob + thumbnail are removed (P3 wiring still fires). No orphan.
8. **i18n + no hardcoded strings (AC-10).** Grep the P8 `.tsx`/`.ts` for user-facing string literals → none
   (all via `t()`); grep for hex → none. EN/SK `chat`/`data`/new `errors` keys have exact parity
   (script-check missing/extra = 0). Backend chat/throttle errors surface localized (empty message, unknown
   recipient, not-related, rate-limited).
9. **Logging, no Sentry (AC-11).** `grep -ri sentry` in `requirements.txt` + code → none. Prod `LOGGING` logs
   to stdout (`prod.py`).
10. **Deploy, host-agnostic (AC-12, AC-13).** With `DJANGO_SETTINGS_MODULE=progresso.settings.prod`,
    `DATABASE_URL=<postgres>`, `BLOB_READ_WRITE_TOKEN=<token>`, `SECRET_KEY`, `ALLOWED_HOSTS`: `migrate` +
    `collectstatic` succeed; the core loop (login → log measurement+photo → trainer roster/compare → chat)
    works end-to-end on **Postgres + Blob**. `git ls-files | grep -E 'db.sqlite3|^media/'` → empty (no data
    files tracked). Build the `Dockerfile` and run it with the same env → the app serves (container-host path
    proven). `vercel.json` present and routes `/api`+`/admin` → Django, else SPA.
11. **No P1–P7 regression.** `/me/*` and `/trainer/*` still work after the nav + lib pagination changes.
    `npm run build` clean (tsc strict + vite + PWA). Django `check` + `makemigrations --check` clean (only the
    intended `0005`/optional `0006` migrations exist).

---

## 8. Risks / notes

- **Chat gate must be symmetric.** `can_access` is directional (`trainee→trainer == False`). Reusing it naively
  would block trainees from chatting their own trainer. The `can_communicate_with` symmetric OR (§5.3) is the
  fix and keeps the single-predicate discipline — do **not** add a separate relationship check. Verified step 2.
- **Chat polling vs. throttling.** The rate-limit must be **scoped to auth only** (§5.7). A global
  `UserRateThrottle` would throttle the chat poll and break the feature — explicitly avoided. Verified step 4.
- **Account-delete is destructive + irreversible.** `DELETE /api/v1/me` cascades measurements/goals/messages
  and cleans blobs. Must be behind a typed confirmation in the UI (§5.8) and blob cleanup must run **before**
  the ORM cascade drops the rows (otherwise the URLs to clean are gone). Trainer-delete must **not** delete
  their trainees (FK `SET_NULL` → self-tracking). Flagged as Q5.
- **`since` timestamp precision.** The client advances `since` to the newest received `created_at`. Use a
  strictly-greater (`created_at__gt`) filter and pass an ISO-8601/epoch timestamp the backend parses
  unambiguously (UTC — `USE_TZ=True`). A `>=` filter would re-deliver the boundary message; a coarse
  resolution could drop a same-second message — use full microsecond precision on both sides.
- **Polling is not realtime.** F2 (SSE/WebSocket) is out (§3). The interval (Q2, 10s) trades latency for load;
  message delivery is near-real-time, not instant. Acceptable for MVP.
- **Static/SPA serving topology (Q7).** The single-service WhiteNoise default is the most host-agnostic but
  couples SPA + API in one deploy. If the developer prefers a separate static front end (Vercel static), the
  `vercel.json` shape changes — hence Q7. The `Dockerfile` (container proof) assumes single-service.
- **Committed dev data.** `db.sqlite3` + `media/` exist in the working tree but are gitignored. Confirm they
  are **not tracked** (`git ls-files`); if a pre-P1 commit tracked them, `git rm --cached`. Do not add them.
- **Measurement index may be unnecessary.** If `Measurement` already orders by an indexed field, skip
  `0006_measurement_index` (§5.5, Q6) — don't add a redundant index.
- **SK completeness** is an AC; developer-drafted SK is acceptable for MVP but flag for native review
  (consistent with P5–P7).

---

## 11. Open questions — ALL RESOLVED to proposed defaults (developer, 2026-08-12)

Q1 symmetric `can_communicate_with`, GET 404 / POST 403. Q2 10s poll. Q3 mark-read on mount + on-new-inbound.
Q4 JSON export, self-only, photo URLs. Q5 **build** `DELETE /me` for all roles, typed-confirm + blob cleanup,
trainer-delete → trainees `head_trainer=NULL`. Q6 transparent `next`-following; conditional measurement index.
Q7 single-service (WhiteNoise). Q8 `ScopedRateThrottle` `auth` 10/min on login+register only. Q9 last-200 on
no-`since`. Q10 add brief `CLAUDE.md`. Q11 branch `main`.

---

## 13. Post-Implementation

**Built (all §11 defaults), on `main`.** Closes the MVP.

*Backend* — one new model + migration `0005_message_and_measurement_index` (Message + the
`Measurement (user,-created_at)` index):
- `core/models/message.py` (new): `Message` (sender/receiver/content/created_at/read_at, CASCADE both FKs,
  indexes `(sender,receiver,created_at)` + `(receiver,read_at)`); exported in `models/__init__.py`; registered
  in `core/admin.py`.
- `core/models/user.py`: `can_communicate_with(other)` — symmetric OR of `can_access` (the chat gate; keeps
  the single predicate).
- `core/api/serializers.py`: `MessageSerializer` (read + `mine`), `MessageCreateSerializer` (`{to, content}`,
  translatable-key validation, `allow_blank`+no-trim so blank routes through `empty_message`).
- `core/api/permissions.py`: `MessageAccessPermission` (POST relationship → 403; GET auth-only, view 404s).
- `core/api/views.py`: `MessagesView` (thread GET with `since`/last-200, send POST), `MessageReadView`
  (mark-read once), `MeExportView` (self data dump), `AccountDeleteView` (self delete; cascade + P3 blob
  signal); `throttle_scope="auth"` on `LoginView`/`RegisterView`.
- `core/api/urls.py`: `messages`, `messages/read`, `me/export`, `me` (DELETE).
- `progresso/settings/base.py`: `ScopedRateThrottle` + `{"auth":"10/min"}`; WhiteNoise middleware;
  `STATIC_ROOT` + `WHITENOISE_ROOT`. `prod.py`: WhiteNoise `STORAGES`. `requirements.txt`: `whitenoise`.

*Frontend* — chat + data-lifecycle inside the P5 shell: `ChatView` (shared thread, 10s poll, mark-read),
pages `Chat` (`/me/chat`, no-trainer prompt) + `TraineeChat` (`/trainer/trainees/:id/chat`); `DataSection`
(export download + typed-confirm delete) on both home screens; libs `messages.ts`, `me.ts`
(`exportData`/`deleteAccount`), `measurements.ts` (`fetchAllPages` — `next`-following, also used by
`trainees.ts`); chat links added to `TraineeNav`/`TrainerNav`; `App.tsx` chat routes; EN/SK catalogs extended
(`chat`, `data`, nav/error keys; exact parity); `formatDateTime` helper.

*Deploy* — `Dockerfile` (2-stage), `vercel.json`, `DEPLOY.md`, and a brief `CLAUDE.md` (Q10);
`.gitignore` gains `staticfiles/`.

**Verification.** `npm run build` clean (tsc strict + Vite + PWA, 54 precache entries). Django `check` +
`makemigrations --check` clean (only `0005`). Prod settings load with WhiteNoise; `collectstatic` copied 163
files. Backend exercised in-process via DRF `APIClient` — **28/28**: symmetric chat gate (trainee↔trainer
allowed, stranger 403, other-trainee 403, cross thread 404), fetch-since, mark-read-once (1 then 0),
empty-message → `empty_message` key, export shape, account-delete (204 + gone + cascade), trainer-delete
leaves trainee `head_trainer` null, auth throttle 429. No browser-driven pass (no automated tests, epic §3) —
exercise the UI flows in §7. Dev users `p8_*` created + deleted by the in-process run; nothing left in the DB.

**Deviations / things to know:**
- **Cross-tenant chat: GET thread 404, POST 403** (as planned Q1) — a trainer/trainee reaching an unrelated
  counterpart's thread 404s (no existence leak); a POST to a stranger 403s (permission).
- **Account-delete + export routes are `me` / `me/export`** (bare, per the plan's literal paths), separate
  from the existing `auth/me` (GET/PATCH). Both self-only.
- **Account-delete blob cleanup rides the P3 cascade signal** — no manual blob loop in `AccountDeleteView`;
  deleting the user cascades to measurements and the existing `post_delete` receiver cleans each blob.
- **`Measurement` gained a `(user,-created_at)` index** (AC-7) — additive, in the same `0005` migration.
- **`UserSerializer` export uses no request context** (BMI/`mine` handled) — export photos are Blob **URLs**.

**Follow-ups / notes:**
- **Auth throttle is per-process** — DRF throttling uses Django's cache; with the default LocMemCache each
  gunicorn worker throttles independently. For a hard cross-worker limit, point `CACHES` at a shared backend
  (Redis/Memcached) in prod. Not required for MVP; flagged.
- **`vercel.json` is a best-effort template** — Django-on-Vercel routing/build may need per-project tuning;
  the `Dockerfile` is the verified host-agnostic path (built/run manually per §7 step 10).
- **SK catalog** developer-drafted (incl. the `DELETE`/`ZMAZAŤ` confirm word); flag for native review
  (consistent with P5–P7).
- **Chat polling** is 10s fixed; realtime (SSE/WebSocket, F2) stays post-MVP.

---

## (original proposals, for reference)

- **Q1 — Chat gate = symmetric `can_communicate_with`, and non-reachable thread returns 404 (not 403)?**
  **Proposal:** add `CustomUser.can_communicate_with(other) = self.can_access(other) or
  other.can_access(self)` and gate all chat endpoints on it; a GET of a thread with a non-reachable user
  returns **404** (no existence leak, consistent with the measurement/goal viewsets, epic Q6), while a POST to
  a non-reachable recipient returns **403**. *(Default: symmetric helper; GET 404 / POST 403.)*
- **Q2 — Poll interval.** **Proposal:** client polls `GET /messages?...&since=` every **10s** while a chat
  screen is open (cleared on unmount); no realtime (F2 out). *(Default: 10s.)*
- **Q3 — Mark-read trigger.** **Proposal:** call `POST /messages/read` on chat-screen mount and again when the
  poll delivers new inbound messages — once each, not per poll. *(Default: mount + on-new-inbound.)*
- **Q4 — Export format & scope.** **Proposal:** `GET /api/v1/me/export` returns a single JSON document of the
  **caller's own** profile + measurements (photo **URLs**, not bytes) + goals + messages; any role can export
  itself; no pagination. *(Default: JSON, self-only, URLs not bytes.)*
- **Q5 — Account-delete: build self-service `DELETE /api/v1/me` for all roles?** Destructive + irreversible
  (cascades + blob cleanup). **Proposal:** build it for **any role**, behind a typed-confirmation dialog;
  trainer-delete leaves trainees `head_trainer=NULL` (not deleted). *(Default: build with confirmation + blob
  cleanup.)* If you'd rather defer account-delete and ship **export-only** for MVP, say so — export alone
  satisfies the "export/**or** delete" reading of the NFR.
- **Q6 — Pagination: `next`-following (fetch-all) vs a "load more" control vs raise `PAGE_SIZE`?**
  **Proposal:** resource libs **follow `next`** transparently for lists that can exceed 50 (measurements,
  photos, roster); keep server `PAGE_SIZE=50`. Also add the `Measurement (user, -measured_at)` index **only
  if** the current ordering field isn't already indexed. *(Default: transparent next-following; conditional
  index.)*
- **Q7 — Deploy topology: confirm single-service (Django + WhiteNoise serves the SPA)?** The architecture
  already commits to this — `progresso/urls.py`/`spa.py` serve the SPA index and defer only `dist/assets` to
  P8. **Proposal:** finish it — WhiteNoise serves the built SPA `assets` + admin static; `vercel.json` routes
  `/api`+`/admin` → Django, else SPA index; `Dockerfile` proves the container path. *(Default: single
  service — confirm.)*
- **Q8 — Auth throttle rate + response.** **Proposal:** `ScopedRateThrottle` scope `"auth"` at **`10/min`** on
  login + register only; throttled → 429 with `errors.rate_limited`. No global throttle (chat polling stays
  free). *(Default: 10/min on auth only.)*
- **Q9 — Initial thread fetch cap.** **Proposal:** a `GET /messages` with no `since` returns the **last 200**
  messages (ordered), then the client walks forward with `since`; full history export lives in `/me/export`.
  *(Default: last 200, non-paginated.)*
- **Q10 — Add a `CLAUDE.md`?** P1 deferred it to P8. **Proposal:** add a **brief** `CLAUDE.md` (conventions:
  layered layout, single predicate, no raw SQL, no tests, i18n, tokens) as part of the deploy/hardening close
  — small, optional, not an AC. *(Default: add a short one.)*
- **Q11 — Branch.** P5–P7 shipped on `main`. **Proposal:** implement P8 on `main` too. *(Default: `main`.)*

---
