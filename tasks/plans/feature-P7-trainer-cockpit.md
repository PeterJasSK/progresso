# Feature Plan: P7 — Trainer Cockpit

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved)
**Plan ID:** P7
**Slug:** trainer-cockpit
**Author:** Claude (Opus)
**Date:** 2026-08-12
**Status:** Complete (2026-08-12; on `main`). Q1 resolved (self-registration + self-service trainer linking, §5.3); Q2–Q8 taken as defaults. Backend verified in-process (25/25 DRF APIClient checks); `npm run build` + Django `check` clean. See §13.

> No GitHub issue. ACs are quoted from the design docs (`tasks/design/*.md`) via the epic §9 P7 brief.
> `design-preview.html` is the rendered visual reference (authoritative for exact look). There are **no
> ticket images**; the design source is the three docs in `tasks/design/`.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7. This plan does
> not add test files, a "test impact" section, or per-AC test mapping.

> **Onboarding conflict flagged up front.** A saved project memory ("Open self-registration") says
> Progresso onboarding is **public signup — trainees self-register and pick their trainer — not
> trainer-created accounts**, and it **overrides the epic**. The epic §9 P7 brief lists
> `POST /api/v1/trainees` (trainer creates a trainee account). These conflict. This plan follows the
> memory (self-registration wins) and treats trainer-creates-account as **superseded** — see **§11 Q1**,
> which must be answered before implementing the "Add trainee" screen.

---

## 0. Context this plan depends on (from P1–P6, already shipped)

P7 builds the trainer-facing screens **inside** the P5 shell, consuming the P2/P3/P4 read APIs scoped by
`?user=:traineeId` (already gated by `can_access` for trainer→own-trainee). The backend work P7 itself adds
is small and bounded: the **roster** read endpoint (`GET /api/v1/trainees` + `GET /api/v1/trainees/:id`)
and the **goal toggle-complete** PATCH route. Everything else is frontend.

### Backend contracts consumed (do not change)

- **`can_access`** (`core/models/user.py:47-69`): admin → all; self → self; trainer → `target.head_trainer_id
  == self.pk`. Helper not handled (post-MVP, returns `False`). This is the only access authority P7 uses.
  There is also `accessible_data_filter(field="user") -> Q` (`user.py:71-84`) — trainer gets
  `Q(user=self) | Q(user__head_trainer=self)`.
- **CustomUser** (`core/models/user.py`): `role ∈ {trainee, trainer, admin, helper}`; `head_trainer` FK to
  self (`related_name="trainees"`, `SET_NULL`); `helpers` M2M (post-MVP, grants nothing). **No `email` and no
  first/last name are populated** in practice — display name comes from `get_full_name() or username`.
- **TargetUserMixin** (`core/api/views.py:36-48`): `get_target_user(request)` resolves `?user=` → that user,
  else `request.user`. `MeasurementViewSet`/`GoalViewSet` inherit it and scope `get_queryset` to the target
  after the permission asserts `can_access`.
- **Measurement API** (`MeasurementViewSet`, `core/api/views.py:115`), all accepting `?user=:id` and gated by
  `MeasurementAccessPermission` (SAFE → `can_access(obj.user)`; trainer read-only, **cannot** mutate a
  trainee's measurement):
  - `GET /api/v1/measurements?user=:id` — paginated `{count,next,previous,results}`.
  - `GET /api/v1/measurements/:id` — one object.
  - `GET /api/v1/measurements/series?user=:id` — `{user, unit_system, dates[], metrics{}, summary{}}` (not
    paginated).
  - `GET /api/v1/measurements/photos?user=:id` — **paginated** array of full measurement objects that have a
    photo (`photo_url != ""`), for the compare picker; photo bytes at the direct Blob `photo_url` (no proxy).
  - Measurement fields: value fields `weight,height,chest,waist,hips,biceps,thigh,calf,body_fat_pct`,
    `unit_system`, `measured_at`, `created_at`, `photo_url`, `thumbnail_url`, computed `bmi`.
- **Goal API** (`GoalViewSet`, `core/api/views.py:189`): list + create only today. `GoalAccessPermission`
  (`core/api/permissions.py:104`) **already admits** the trainer/owner PATCH:
  `has_object_permission` for PATCH returns `obj.user_id == user.pk or (user.role == TRAINER and
  user.can_access(obj.user))` (`permissions.py:142`). `GoalSerializer.read_only_fields = ("user",
  "is_completed", "created_at")` (`serializers.py:340`) — so `is_completed` is **read-only on the default
  serializer**; the toggle needs a dedicated writable path (§5.2). P7 PATCH seam comments already exist at
  `views.py:194-196`, `urls.py:27-29`, `goal.py:11-13`, `permissions.py:112-114`.
- **Pagination**: `PageNumberPagination`, `PAGE_SIZE=50`, app-wide (`progresso/settings/base.py:95-96`).
  All list endpoints return the envelope; P7 reads the first page only (following `next` is a P8 NFR).
- **URL map today** (`core/api/urls.py`, all under `/api/v1/`): `auth/{register,trainers,login,logout,me}`,
  `measurements` (list/create), `measurements/{photos,series}`, `measurements/<int:pk>`, `goals`
  (list/create). **No `goals/<int:pk>` and no `/trainees` route yet.**

### Frontend contracts consumed (from P5/P6)

- **API client** (`frontend/src/lib/api.ts`): `api.get<T>(path)`, `api.post<T>(path, body?, anonymous?)`,
  `api.patch<T>(path, body?)`, `api.del<T>(path)`, `api.upload<T>(path, form, method?)`. `ApiError` carries
  `.status` and `.key`; callers localize via `t('errors.<key>')`. All P7 client needs already exists — no new
  client helper required.
- **Resource libs**: `lib/measurements.ts` (`listMeasurements(userId?)`, `getMeasurement(id)`,
  `getSeries(userId?)`, plus `Measurement`/`Series`/`Paginated<T>` types — every list fn already takes an
  optional `userId` and unwraps `.results`), `lib/goals.ts` (`listGoals(userId?)`, `createGoal`;
  **no toggle fn yet — P7 adds it**), `lib/metricMeta.ts` (`MetricKey`, `METRICS`, `VALUE_METRICS`,
  `GOAL_METRICS`, `METRIC_BY_KEY`, per-metric `labelKey`/`unit`/`colorVar`), `lib/format.ts`
  (`formatDecimal`, `formatWithUnit`).
- **Component kit** (`frontend/src/components/`): `AppShell({children, actionBar?})`, `Avatar({name})`,
  `Button({variant})`, `Card`, `Input({numeric})`, `Pill({variant:'accent'|'warn'|'ok'})`,
  `StatTile({label,value,delta?,deltaLabel?,trend?})`, `Spinner`, `GoalCard({goal})` (display-only),
  `MeasurementCard({measurement})`, `MetricChart({labels,data,colorVar,label,theme})`, `ThemeToggle`,
  `LanguageSwitcher`. **`TraineeNav` is trainee-only** (its header comment says P7 builds its own trainer
  nav) — P7 authors `TrainerNav`.
- **i18n** (`frontend/src/i18n/`): `useTranslation()` → `t('dotted.key')`; catalogs `en.json` (base) +
  `sk.json` (complete parallel). Top-level namespaces: `app, common, theme, lang, nav, roles, metrics, auth,
  home, measurements, capture, detail, progress, goals, errors, notfound`. Helpers `formatNumber`,
  `formatDate` (`i18n/index.ts`).
- **Auth/routing**: `useAuth()` → `{user:{id,username,role}, loading, login, register, logout}`;
  `roleHome('trainer') === '/trainer'`. `RequireAuth` + `RequireRole role="trainer"` guard the trainer
  subtree. `frontend/src/App.tsx:53-62` currently mounts only `TrainerHomePlaceholder` (a "PLACEHOLDER" pill
  + two **hardcoded fake** StatTiles) under `/trainer`; no trainer sub-routes exist.
- **Tokens** (`frontend/tailwind.config.ts` + `frontend/src/styles/tokens.css`): utilities `bg-*/text-*/
  border-*`, `font-display|sans|mono`, `rounded-*`, `shadow-card|glow`; chart palette as `--c-*` CSS vars.

---

## 1. Goal

Deliver the trainer's review surface — the frame P5 built, populated for the coach:

- **`/trainer` roster home** — every trainee the trainer owns as a card: display name/avatar, last-measurement
  date (mono), a weight trend arrow, and an **overdue** pill when the trainee hasn't logged recently. Backed by
  the **new `GET /api/v1/trainees` roster endpoint** this plan introduces. "See the roster without opening
  each trainee" (epic §10).
- **`/trainer/trainees/new` add trainee** — **Q1 resolved:** trainees self-register; at signup they pick a
  trainer **or** choose **unassigned** (self-track, no trainer), and can **link a trainer later**. So this
  screen is **onboarding instructions** (share the signup link; the client registers and picks this trainer,
  or attaches later), **not** an account-creation form. No `POST /api/v1/trainees`. The signup pick/unassigned
  path already exists (P1 `RegisterSerializer.trainer_id`, nullable `head_trainer`); P7 adds only the
  **link-later** self-service path (§5.3).
- **`/trainer/trainees/:id` overview** — the trainee's summary (latest hero metric + quick links to their
  measurements / progress / photos / goals; chat link is P8, absent).
- **`/trainer/trainees/:id/measurements`** — the trainee's entries, newest-first, **read-only** (no
  create/edit/delete — the API forbids trainer mutation).
- **`/trainer/trainees/:id/progress`** — the trainee's charts over time (reusing `MetricChart` against the P4
  series endpoint scoped by `?user=`).
- **`/trainer/trainees/:id/photos`** — the **photo-compare** screen: pick two dates, view them **side-by-side**
  (D1). Overlay/slider + pose guide are post-MVP (D2, §3).
- **`/trainer/trainees/:id/goals`** — the trainee's goals, **view + toggle-complete** (the new goal PATCH this
  plan introduces).

Plus the enabling backend: the **roster read endpoint** and the **goal toggle PATCH**.

`/trainer/trainees/:id/chat` is **P8** (out of scope, §3).

---

## 2. Acceptance criteria (quoted from design docs via epic §9 P7)

- [x] **AC-1** Trainer screens exist and route correctly — Covered by `frontend/src/App.tsx:69-91`
  (`/trainer`, `/trainer/trainees/new`, `/trainer/trainees/:id`, `.../measurements[/:mid]`, `.../progress`,
  `.../photos`, `.../goals`, all via the `trainer()` guard `App.tsx:47-53`) + page files
  `frontend/src/pages/{TrainerHome,AddTrainee,TraineeOverview,TraineeMeasurements,TraineeMeasurementDetail,TraineeProgress,PhotoCompare,TraineeGoals}.tsx`. `.../chat` intentionally absent (P8).
- [x] **AC-2** Roster at-a-glance progress — Covered by `frontend/src/pages/TrainerHome.tsx` (grid of cards)
  + `frontend/src/components/RosterCard.tsx` (avatar, last-logged mono date, weight trend arrow+delta, overdue
  `Pill` when >7d/null) fed by `core/api/serializers.py:76` (`RosterEntrySerializer`) +
  `core/services/roster.py` (annotate `last_measured_at`/`measurement_count`, prefetch, weight delta/trend via
  `metrics`). Verified: latest 78.0, delta −2.0, trend "down", never-logged null.
- [x] **AC-3** Photo compare side-by-side — Covered by `frontend/src/pages/PhotoCompare.tsx` (two date
  selectors over the trainee's dated photos, default oldest-left/newest-right, two-column full-res side-by-side)
  consuming `listPhotos(id)` (`frontend/src/lib/measurements.ts`). No overlay/slider (D2 out).
- [x] **AC-4** Roster read APIs — Covered by `core/api/views.py:251` (`TraineeViewSet`, list+retrieve) +
  `core/api/permissions.py:61` (`TraineeRosterPermission`) + `core/api/urls.py:55-56` (`trainees`,
  `trainees/<int:pk>`). Gated by trainer-role + `can_access`. Verified: T1 200, trainee 403, non-owner 404.
- [x] **AC-10** Self-service trainer linking — Covered by `core/api/views.py:124` (`MeView.patch`,
  trainee-only, self-only) + `core/api/serializers.py:46` (`LinkTrainerSerializer`, null=unlink) +
  `frontend/src/lib/me.ts` (`linkTrainer`) + `frontend/src/components/TrainerLink.tsx` ("Your trainer" control
  on `/me`, `pages/TraineeHome.tsx`). Signup pick/unassigned already in P1 (`RegisterPage.tsx:105-122`).
  Verified: link 200 → on roster; unlink → off; non-trainer 400; trainer PATCH 403.
- [x] **AC-5** Goal toggle-complete — Covered by `core/api/serializers.py:473` (`GoalToggleSerializer`,
  writable `is_completed`) + `core/api/views.py:224,231` (`GoalViewSet.get_serializer_class` +
  detail queryset via `accessible_data_filter`) + `core/api/urls.py:54` (`goals/<int:pk>` PATCH) +
  `frontend/src/lib/goals.ts` (`toggleGoal`) + `frontend/src/pages/TraineeGoals.tsx` +
  `components/GoalCard.tsx` (`onToggle`). Verified: owning trainer 200, non-owner 404, owner trainee 200.
- [x] **AC-6** Trainer views trainee data, read-only — Covered by `frontend/src/pages/TraineeMeasurements.tsx`
  + `TraineeMeasurementDetail.tsx` (no edit/delete) + `TraineeProgress.tsx` (via shared
  `components/ProgressView.tsx`), all scoped by `?user=:id`. Mutation blocked by the existing
  `MeasurementAccessPermission` (`core/api/permissions.py:118-125`). Verified: trainer PATCH/DELETE → 403.
- [x] **AC-7** Instrument-panel fidelity — values/dates `font-mono` (`RosterCard.tsx`,
  `TraineeMeasurementDetail.tsx`), headings/hero `font-display`; roster items are `Card`s with trend arrow +
  overdue `Pill`. **No hardcoded hex** in any P7 file (grep-verified — colors via token utilities / CSS vars).
- [x] **AC-8** i18n — Covered by `frontend/src/i18n/en.json` + `sk.json` (`nav.trainer.*`, `trainer.*`,
  `home.trainer.*` link keys; EN↔SK key parity exact — script-verified 0 missing/extra). All P7 components use
  `t()`; dates/numbers via `formatDate`/`formatWithUnit`; backend keys via `t('errors.<key>')` incl. new
  `not_a_trainee`.
- [x] **AC-9** Access API-enforced — Covered by `core/api/permissions.py:61` (roster trainer-only) +
  `can_access`/`accessible_data_filter` scoping in `TraineeViewSet`/`GoalViewSet`, plus `App.tsx:47-53`
  UI guard. Verified in-process (25/25): roster shows own trainees only; trainee→403; cross-trainer→404
  (no-existence-leak, see §13); trainer measurement mutation→403.

---

## 3. Out of scope (deferred — do not build in P7)

- **`/trainer/trainees/:id/chat`** and any messaging (P8). No chat screen, no message polling.
- **Overlay/slider photo compare + pose guide** (`rebuild-analysis.md` §6 D2) — post-MVP. P7 ships
  side-by-side only (D1).
- **Assistant-trainer management** (G2) and **audit-log view** (G3) — post-MVP (epic §9 P7 out-of-scope).
  The `helpers` M2M and `can_access` helper branch stay untouched.
- **Trainer creating trainee accounts** (`POST /api/v1/trainees`) — superseded by self-registration per the
  memory (§11 Q1). Not built unless the developer overrides the memory.
- **Editing / deleting trainee accounts** (`PATCH`/`DELETE /api/v1/trainees/:id`) — see §11 Q6. Default:
  **not built** (destructive; the user model has no editable profile fields; account lifecycle is the
  trainee's via self-registration). A non-destructive "remove from my roster" (detach `head_trainer`) is the
  proposed alternative *only if* the developer wants it.
- **Trainer mutating measurements/goals-content** — the API forbids it; P7's measurement views are read-only,
  and the only goal write is the `is_completed` toggle.
- **Pagination / `next`-following** on roster or the trainee's lists — P8 NFR. P7 reads first page (with a
  logged caveat if a trainee exceeds 50 rows, consistent with P6).
- **Server-side goal auto-progress** (goal reads current metric value) — post-MVP; goals stay declarative,
  toggle is manual.

---

## 4. Cross-cutting decisions this plan adopts (from epic §3, not re-litigated)

- **React + Tailwind**, tokens the single source, no hardcoded hex (epic Q1, §3).
- **Session auth**, same-origin, CSRF via the P5 handshake; unsafe requests carry `X-CSRFToken` (epic Q2) —
  the goal-toggle PATCH goes through `api.patch`, which already attaches it.
- **Numbers are mono** — JetBrains Mono for every value/date; Orbitron headings/hero numbers; Inter elsewhere
  (`design-system.md` §3).
- **i18n from day one** — no hardcoded strings; EN base + complete SK; locale-aware formatting (epic Q6).
- **One authorization predicate** — every P7 endpoint resolves access only through `can_access` (roster =
  "trainer + `head_trainer == self`", which `can_access` and `related_name="trainees"` already express); no
  inline `if role` data checks (epic §3).
- **API-first** — all data via DRF JSON at `/api/v1/`; the SPA holds no business logic (epic §3).
- **Layered backend layout** — roster serializer/view/permission under `core/api/`; any non-trivial
  aggregation (last-measurement + trend per trainee) lives in a `core/services/` module, not the view or
  serializer (epic §3 "thin viewsets", "no business logic in controllers").
- **No raw SQL** — roster aggregation via the Django ORM (`annotate`/`prefetch_related`), never raw SQL
  (epic §3).
- **Performance on the roster** — `select_related`/`prefetch_related` so the roster is not N+1
  (`rebuild-analysis.md` §7 perf, epic §9 P8 — applied here because the roster is the one P7 endpoint that
  fans out over many trainees).
- **Host-agnostic** — API base from `VITE_API_BASE` (default same-origin `/api/v1`) (epic Q5).

---

## 5. Design / approach

### 5.1 Roster read API — `GET /api/v1/trainees`, `GET /api/v1/trainees/:id`

A trainer's roster of owned trainees, each annotated with the at-a-glance progress AC-2 needs.

- **`RosterEntrySerializer`** (`core/api/serializers.py`, new): read-only, fields
  `id, username, display_name, role, last_measured_at, measurement_count, primary_metric, latest_value,
  delta, trend`. `display_name = get_full_name() or username` (mirror `TrainerOptionSerializer`,
  `serializers.py:33`). `primary_metric` is `"weight"` (the roster arrow tracks weight — the headline metric,
  `design-system.md` §2 palette leads with weight); `latest_value`/`delta`/`trend` are the weight readout for
  the two most recent entries. All five progress fields are `SerializerMethodField`s that read
  **pre-aggregated** data attached by the service (no per-serializer queries → no N+1).
- **Aggregation service** — `core/services/roster.py` (new): `build_roster(trainer) -> list[RosterRow]`.
  One queryset: `trainer.trainees.all()` with `.annotate(last_measured_at=Max("measurements__measured_at"),
  measurement_count=Count("measurements"))` and a `Prefetch("measurements",
  queryset=Measurement.objects.order_by("-created_at"))` so the two latest weight values are in memory. Compute
  the weight `delta` (latest − previous non-null weight) and `trend` (`"up"|"down"|"flat"|None`) by reusing
  the existing trend helper in `core/services/metrics.py` (do **not** re-implement the up/down/flat rule).
  Return lightweight rows the serializer maps. Overdue is **not** computed here — it's client-side (§11 Q4).
  All ORM, no raw SQL.
- **`TraineeRosterPermission`** (`core/api/permissions.py`, new): list → `IsAuthenticated` + `role ==
  TRAINER` (a trainee hitting `/trainees` → 403; roster is trainer-only per `mvp-routes.md` §C).
  `has_object_permission(obj)` → `request.user.can_access(obj)` (the single predicate — a trainer reaching a
  trainee they don't own → 403). Reuse `IsTrainee`'s shape (`permissions.py:46`) for the role gate; do not
  inline role logic in the view.
- **`TraineeViewSet`** (`core/api/views.py`, new): `ReadOnlyModelViewSet` (list + retrieve only),
  `serializer_class = RosterEntrySerializer`, `permission_classes = [IsAuthenticated,
  TraineeRosterPermission]`, `parser_classes = [JSONParser]`.
  - `list`: `queryset = build_roster(request.user)` (the service returns the annotated/prefetched trainees);
    DRF paginates the envelope as everywhere else.
  - `retrieve`: `get_object()` fetches the single trainee (from `CustomUser`), `check_object_permissions`
    runs `can_access`; serialize with the same serializer (single-row aggregation via the service or a
    per-object annotate). Retrieve is enough for `/trainer/trainees/:id` overview; the overview screen also
    calls the existing `getSeries(traineeId)` for the hero tile, so `retrieve` can stay minimal (id +
    display_name + last_measured_at) if richer per-metric data is wanted — see §5.6 overview.
- **URLs** (`core/api/urls.py`, edit):
  ```python
  _trainee_list = TraineeViewSet.as_view({"get": "list"})
  _trainee_detail = TraineeViewSet.as_view({"get": "retrieve"})
  path("trainees", _trainee_list, name="trainee-list"),
  path("trainees/<int:pk>", _trainee_detail, name="trainee-detail"),
  ```
  (`POST`/`PATCH`/`DELETE` on these routes are **not** wired — see §11 Q1/Q6. If Q1/Q6 opt in, they attach to
  the same viewset; the permission already shapes owner-scoping.)

### 5.2 Goal toggle-complete — `PATCH /api/v1/goals/:id`

The permission is already in place (`GoalAccessPermission.has_object_permission` admits owner-or-owning-trainer
PATCH, `permissions.py:142`). Two things are missing: the route and a **writable** `is_completed` path
(the default `GoalSerializer` has `is_completed` in `read_only_fields`, `serializers.py:340`).

- **`GoalToggleSerializer`** (`core/api/serializers.py`, new, small): `Meta.model = Goal`,
  `fields = ("id", "is_completed")`, with `is_completed` **writable**. This keeps the toggle a single-field
  update — a trainer (or owner) can flip completion but cannot rewrite metric/target/direction/description via
  the toggle route (those stay owned by create, which is trainee-only).
- **`GoalViewSet.partial_update`** (`core/api/views.py`, edit): add the action; override
  `get_serializer_class` to return `GoalToggleSerializer` for `partial_update` and `GoalSerializer`
  otherwise. `permission_classes` unchanged (already admits it). No new permission logic. Object lookup runs
  `check_object_permissions` → `can_access`/owner gate. Do not wire `retrieve`/`destroy` (not needed by P7).
- **URLs** (`core/api/urls.py`, edit): uncomment/add the seam already noted at `urls.py:27-29`:
  ```python
  _goal_detail = GoalViewSet.as_view({"patch": "partial_update"})
  path("goals/<int:pk>", _goal_detail, name="goal-detail"),
  ```

### 5.3 Onboarding & trainer-linking (Q1 resolved)

Trainees self-register (memory). At signup they either pick a trainer or choose **unassigned** (self-track),
and they can **link a trainer later**. Three parts:

**(a) Signup pick / unassigned — already shipped (P1), verify only.** `RegisterSerializer` already accepts an
optional `trainer_id` (`serializers.py:46-105`) and `head_trainer` is nullable, so "pick a trainer" and
"unassigned" both work today. P7 changes nothing here except confirming the signup UI (P5 register screen)
exposes an explicit **"No trainer (track myself)"** choice in the trainer dropdown. If the P5 register screen
forces a trainer selection, add the empty/"unassigned" option to it (small P5-screen edit) — otherwise leave
it.

**(b) Link / change / unlink a trainer later — NEW self-service path (backend + trainee UI).** A trainee sets
their **own** `head_trainer` after the fact.
- Backend: `PATCH /api/v1/auth/me` accepting only `{ trainer_id: <id> | null }` — self-only, trainee-only.
  Reuse the trainer-validation from `RegisterSerializer` (target must be an existing user with `role ==
  TRAINER`); `null` clears `head_trainer` (back to self-tracking). Implement as a `partial_update`/PATCH on
  the existing `MeView` (`core/api/views.py:106`) with a small `LinkTrainerSerializer` (writable `trainer_id`
  only), or a dedicated `LinkTrainerView` if cleaner — either way permission = `IsAuthenticated` + the caller
  edits only themselves (no `?user=`; always `request.user`). No `can_access` needed (self-edit).
- Trainee UI: a small **"Your trainer"** section on the trainee home (`pages/TraineeHome.tsx`, P6 file, edit)
  — shows the current trainer's display name or "No trainer", with a picker (populated from the existing
  `GET /api/v1/auth/trainers`, `auth-trainers`) to link one and an "unlink / track myself" action. Keep it
  minimal; all copy via i18n.

**(c) Trainer "Add trainee" screen — onboarding instructions.** `/trainer/trainees/new` shows how a client
joins: "Share your signup link; the client registers and selects you — or links you later from their home."
Surface the public signup URL (`/register`) and the trainer's own display name so the client can find them in
the dropdown. **No backend endpoint, no `POST /api/v1/trainees`.** New trainees appear on the roster
automatically once they self-register under (or later link to) this trainer.

### 5.4 Frontend route table — `frontend/src/App.tsx` (edit)

Replace the single `/trainer` placeholder with the trainer subtree, all under the existing
`RequireAuth > RequireRole role="trainer"` guard (add a `trainer(el)` helper mirroring the `trainee(el)`
helper at `App.tsx:31`):

| Path | Element |
|------|---------|
| `/trainer` | `TrainerHome` (roster) |
| `/trainer/trainees/new` | `AddTrainee` (onboarding instructions — §5.3 / Q1) |
| `/trainer/trainees/:id` | `TraineeOverview` |
| `/trainer/trainees/:id/measurements` | `TraineeMeasurements` (read-only list + inline/linked detail) |
| `/trainer/trainees/:id/progress` | `TraineeProgress` |
| `/trainer/trainees/:id/photos` | `PhotoCompare` |
| `/trainer/trainees/:id/goals` | `TraineeGoals` (view + toggle) |

`TrainerHomePlaceholder.tsx` is **deleted** (replaced by `TrainerHome.tsx`). Navigation between trainer
screens uses `react-router` `Link`/`useNavigate`; a new `TrainerNav` component (mirroring `TraineeNav`)
provides the trainer chrome (Roster / and, within a trainee, breadcrumb-style links to that trainee's
Measurements / Progress / Photos / Goals).

### 5.5 Frontend resource module — `frontend/src/lib/trainees.ts` (new) + `goals.ts` (edit)

- **`trainees.ts`** (new): `type RosterEntry = { id:number; username:string; display_name:string;
  role:string; last_measured_at:string|null; measurement_count:number; primary_metric:string;
  latest_value:number|null; delta:number|null; trend:'up'|'down'|'flat'|null }`.
  `listTrainees(): Promise<RosterEntry[]>` (unwraps `.results` via the shared `Paginated<T>` type),
  `getTrainee(id): Promise<RosterEntry>`. Reuse the `Paginated<T>` type exported from `measurements.ts` (or
  lift it to a shared `lib/pagination.ts` if cleaner — one definition, no copy).
- **`goals.ts`** (edit): add `toggleGoal(id:number, isCompleted:boolean): Promise<Goal>` →
  `api.patch('/goals/' + id, { is_completed: isCompleted })`. No other change.
- Measurements/series/photos: reuse `listMeasurements(traineeId)`, `getMeasurement(id)`,
  `getSeries(traineeId)`, and add `listPhotos(traineeId)` to `measurements.ts` (thin wrapper over
  `GET /measurements/photos?user=:id`, unwrapping `.results`) — the photos endpoint is not yet wrapped in the
  lib.

### 5.6 Screens

**`TrainerHome` (`/trainer`)** — `pages/TrainerHome.tsx`. Fetches `listTrainees()`. Renders a responsive grid
(`design-system.md` §6 "responsive grid of trainee cards on desktop, stacked on mobile") of `RosterCard`s
(new component). Each card: `Avatar({name: display_name})`, display name (Inter), `last_measured_at` (mono
via `formatDate`), a weight trend arrow + `delta` (reuse `StatTile`'s trend visual or a small inline
arrow+delta), and an **overdue** `Pill variant="warn"` when `last_measured_at` is > 7 days ago or null (§11
Q4, client-side, consistent with P6 Q7). Cards link to `/trainer/trainees/:id`. Empty roster → a first-run
prompt explaining that trainees appear here once they self-register under this trainer (links to
`/trainer/trainees/new` instructions). Action bar CTA → `/trainer/trainees/new`.

**`AddTrainee` (`/trainer/trainees/new`)** — `pages/AddTrainee.tsx`. Per §5.3 default: an instructions card —
how a client joins (share the signup link, pick this trainer). No form submit in the default. (Alt: the
account-create form if Q1 opts in.) All copy via i18n.

**`TraineeOverview` (`/trainer/trainees/:id`)** — `pages/TraineeOverview.tsx`. Fetches `getTrainee(id)` +
`getSeries(id)`. Header: `Avatar` + display name + `last_measured_at`. A hero `StatTile` for the primary
metric (weight) from the series `summary` (latest/delta/trend), plus a couple of secondary tiles (waist,
chest) — reusing exactly the P6 `TraineeHome` composition but read-only and scoped by `id`. Quick links
(`TrainerNav` sub-links) to `.../measurements`, `.../progress`, `.../photos`, `.../goals`. **No chat link**
(P8). On 404/403 → localized not-found/redirect to `/trainer`.

**`TraineeMeasurements` (`/trainer/trainees/:id/measurements`)** — `pages/TraineeMeasurements.tsx`. Fetches
`listMeasurements(id)`. Lists `MeasurementCard`s (reused) newest-first. **Read-only**: no create CTA, no
edit/delete. A card opens the entry — either a detail sub-route (`/trainer/trainees/:id/measurements/:mid`
reusing a read-only `MeasurementDetail` view without owner actions) **or** an inline expand (§11 Q5 — default:
add the read-only detail sub-route, reusing `getMeasurement(mid)` and the same mono readout, minus
Delete/Edit). Empty → localized "no measurements yet".

**`TraineeProgress` (`/trainer/trainees/:id/progress`)** — `pages/TraineeProgress.tsx`. Fetches
`getSeries(id)`. Identical to the P6 `Progress` screen (metric selector + `MetricChart` + summary
`StatTile`s), only the `userId` differs. Extract the shared chart-page body into a reusable piece if it
avoids duplicating P6's `Progress` (epic §3 "zero duplicated logic") — a `ProgressView({userId})` component
consumed by both P6 `/me/progress` and P7 `/trainer/.../progress` is the clean shape; refactor P6's page to
delegate to it. (§11 Q7 — default: extract the shared view.)

**`PhotoCompare` (`/trainer/trainees/:id/photos`)** — `pages/PhotoCompare.tsx` (**the D1 deliverable**).
Fetches `listPhotos(id)` → the trainee's measurements that have a photo, each with `photo_url`,
`thumbnail_url`, and `measured_at`. UI: two date selectors (dropdowns/pills of the available dated photos —
mono dates), defaulting to the **oldest** on the left and **newest** on the right (the natural before/after).
Below, a two-column side-by-side layout (stacked on narrow mobile) showing each selected `photo_url`
full-resolution with its `measured_at` caption (mono). No overlay/slider (D2, §3). Empty → localized "no
photos yet". All full-res bytes come from the direct Blob URL (no proxy).

**`TraineeGoals` (`/trainer/trainees/:id/goals`)** — `pages/TraineeGoals.tsx`. Fetches `listGoals(id)`. Lists
`GoalCard`s (reused for display) with a **complete toggle** the trainer can flip (a checkbox/`Button` on each
card → `toggleGoal(goal.id, !goal.is_completed)` → optimistic update or refetch; a completed goal shows the
`ok` `Pill`). This is the one goal write P7 adds. `GoalCard` currently has no toggle handler — extend it with
an optional `onToggle?` prop (P6 usage without the prop stays display-only, no P6 regression). No add-goal
form here (goal creation is trainee-only, P6). Errors localized via `t('errors.<key>')`.

### 5.7 i18n keys — `frontend/src/i18n/en.json` + `sk.json` (edit)

Add namespaced keys for every new string (both catalogs, exact parallel — AC-8). New/extended namespaces:
`nav.trainer.*` (Roster, Measurements, Progress, Photos, Goals), `trainer.roster.*` (title, last-logged,
overdue, empty, add-cta), `trainer.addTrainee.*` (instructions copy, signup-link label), `trainer.overview.*`
(hero labels, quick links), `trainer.photos.*` (compare title, left/right/before/after, pick-date, empty),
`trainer.goals.*` (toggle labels, complete/active). Reuse existing `metrics.*`, `measurements.*`,
`progress.*`, `goals.*` where the trainer screens show the same content as P6 (metric names, chart labels) —
do not duplicate metric label keys. SK is developer-drafted (flag for native review, consistent with
P5/P6).

---

## 6. File Plan

Backend is Python (strict types via `from __future__ import annotations`, full type hints, PEP 8; **no raw
SQL** — Django ORM only, `annotate`/`prefetch_related` for the roster). Frontend is TypeScript/TSX (strict),
no hardcoded hex, no user-facing string literal outside the i18n catalogs.

| File | Change | Notes |
|------|--------|-------|
| `core/api/serializers.py` | edit | add `RosterEntrySerializer` + `GoalToggleSerializer` + `LinkTrainerSerializer` (§5.1, §5.2, §5.3b) |
| `core/api/permissions.py` | edit | add `TraineeRosterPermission` (§5.1) |
| `core/api/views.py` | edit | add `TraineeViewSet` (list/retrieve); `GoalViewSet.partial_update` + `get_serializer_class`; `MeView` PATCH for self-link (§5.1, §5.2, §5.3b) |
| `core/api/urls.py` | edit | add `trainees` + `trainees/<int:pk>` routes; wire `goals/<int:pk>` PATCH; allow PATCH on `auth/me` (§5.1, §5.2, §5.3b) |
| `core/services/roster.py` | new | `build_roster(trainer)` — annotate + prefetch, reuse `metrics.py` trend helper; no raw SQL (§5.1) |
| `frontend/src/lib/trainees.ts` | new | `RosterEntry` type + `listTrainees`/`getTrainee` (§5.5) |
| `frontend/src/lib/goals.ts` | edit | add `toggleGoal(id, isCompleted)` (§5.5) |
| `frontend/src/lib/measurements.ts` | edit | add `listPhotos(userId)` wrapper (§5.5) |
| `frontend/src/lib/auth` (client) | edit | add `linkTrainer(trainerId\|null)` → `api.patch('/auth/me', {trainer_id})` (§5.3b) |
| `frontend/src/pages/TraineeHome.tsx` | edit (P6 file) | add minimal "Your trainer" link/unlink section (§5.3b) |
| `frontend/src/pages/Register.tsx` (P5, if it forces trainer) | edit | ensure an "unassigned / no trainer" option in the trainer dropdown (§5.3a) |
| `frontend/src/App.tsx` | edit | trainer route subtree + `trainer(el)` guard helper (§5.4) |
| `frontend/src/components/TrainerNav.tsx` | new | trainer chrome / sub-nav (§5.4) |
| `frontend/src/components/RosterCard.tsx` | new | roster grid item: avatar, last-logged, trend, overdue pill (§5.6) |
| `frontend/src/components/GoalCard.tsx` | edit | optional `onToggle?` prop (P6 usage unaffected) (§5.6) |
| `frontend/src/components/ProgressView.tsx` | new | shared metric-chart page body, consumed by P6 `/me/progress` + P7 trainer progress (§5.6 Q7) |
| `frontend/src/pages/Progress.tsx` | edit | delegate to `ProgressView({userId:self})` (avoid duplication) (§5.6 Q7) |
| `frontend/src/pages/TrainerHome.tsx` | new | `/trainer` roster (§5.6) |
| `frontend/src/pages/AddTrainee.tsx` | new | `/trainer/trainees/new` onboarding instructions (§5.3/§5.6) |
| `frontend/src/pages/TraineeOverview.tsx` | new | `/trainer/trainees/:id` (§5.6) |
| `frontend/src/pages/TraineeMeasurements.tsx` | new | `/trainer/trainees/:id/measurements` read-only (§5.6) |
| `frontend/src/pages/TraineeMeasurementDetail.tsx` | new | read-only detail sub-route (§5.6 Q5) |
| `frontend/src/pages/TraineeProgress.tsx` | new | `/trainer/trainees/:id/progress` (§5.6) |
| `frontend/src/pages/PhotoCompare.tsx` | new | `/trainer/trainees/:id/photos` side-by-side (§5.6) |
| `frontend/src/pages/TraineeGoals.tsx` | new | `/trainer/trainees/:id/goals` view + toggle (§5.6) |
| `frontend/src/pages/TrainerHomePlaceholder.tsx` | delete | replaced by `TrainerHome.tsx` |
| `frontend/src/i18n/en.json` | edit | add P7 keys (§5.7) |
| `frontend/src/i18n/sk.json` | edit | add P7 keys, complete parallel (§5.7) |

No new backend migration (P7 adds no model/field — roster is read-only aggregation, goal toggle uses the
existing `is_completed` column). No `CLAUDE.md` (deferred to P8 per P1). No test files (epic §3).

---

## 7. Manual verification (no automated tests — epic §3)

Run the Django backend (`python manage.py migrate && python manage.py runserver`) and the Vite dev server
(`cd frontend && npm install && npm run dev`, proxy to `:8000`). You need a **trainer** account and at least
**two trainees**: one whose `head_trainer` is this trainer (owned), one under a **different** trainer (for the
403 check). Have the owned trainee log ≥2 measurements (one with a photo) so trend/photo-compare have data.
Each step maps to an AC.

1. **Roster API + access (AC-4, AC-9).** As the trainer: `GET /api/v1/trainees` → 200, an array of **only**
   this trainer's trainees, each with `last_measured_at`, `measurement_count`, weight `latest_value`/`delta`/
   `trend`. As a **trainee**: `GET /api/v1/trainees` → 403 (roster is trainer-only). As **another** trainer:
   `GET /api/v1/trainees/<owned-trainee-id>` → 403 (`can_access` denies non-owner). Confirm the roster query
   is not N+1 (one aggregate query + one prefetch — check `django.db.connection.queries` count is small and
   constant regardless of trainee count).
2. **Roster screen (AC-1, AC-2, AC-7).** `/trainer` shows a card per owned trainee: avatar, display name,
   last-measurement date (mono), a weight trend arrow + delta, and an **overdue** pill for a trainee who last
   logged > 7 days ago (temporarily backdate one to verify; a trainee who logged today has no pill). Grid on
   desktop, stacked on mobile. Empty-roster state shows the self-registration prompt. All numbers mono,
   headings Orbitron.
3. **Add-trainee + self-service linking (AC-1, AC-10).** `/trainer/trainees/new` shows onboarding
   instructions (share signup link) — **no account form** (Q1). Self-register a new trainee at `/register`
   choosing this trainer → appears on `/trainer`. Register another as **unassigned** → not on any roster; from
   that trainee's `/me` "Your trainer" control, **link** this trainer → `PATCH /api/v1/auth/me` succeeds and
   they now appear on `/trainer`; **unlink** → they drop off. A trainee cannot set another user's trainer
   (endpoint always edits `request.user`); `trainer_id` pointing at a non-trainer → validation error.
4. **Overview + trainee data, read-only (AC-1, AC-6, AC-9).** `/trainer/trainees/:id` shows the hero metric +
   quick links. `.../measurements` lists the trainee's entries (read-only — no create/edit/delete controls);
   opening one shows the read-only detail (values, BMI, full photo, dates). Attempt `PATCH`/`DELETE
   /api/v1/measurements/<their-id>` directly → **403** (trainer cannot mutate). `.../progress` charts the
   selected metric (line in brand color, mono ticks, faint gridlines); theme toggle re-colors.
5. **Photo compare (AC-3).** `.../photos`: two date selectors list the trainee's dated photos; default oldest
   left / newest right. Selecting two dates shows the two full-res photos **side-by-side** with mono date
   captions; stacked on narrow mobile. No overlay/slider present (D2 is out). Empty (no photos) → localized
   empty state.
6. **Goal toggle (AC-5).** `.../goals` lists the trainee's goals. Toggle one complete → `PATCH
   /api/v1/goals/:id` succeeds, the `ok` pill appears, and the change persists on reload / shows in `/admin/`.
   Toggle back → active again. Confirm the owner trainee can also toggle their own goal (P6 screen or API),
   and **another** trainer toggling this trainee's goal → 403.
7. **i18n (AC-8).** Switch EN→SK in the shell: **every** P7 string changes — trainer nav, roster labels
   (last-logged, overdue), add-trainee instructions, overview, photo-compare (before/after, pick date), goal
   toggle labels, and any mapped backend error. Reload → language persists. Grep the P7 `.tsx`/`.ts` for
   user-facing string literals → none (all via `t()`); grep for hex literals → none (AC-7).
8. **No P6 regression.** `/me`, `/me/measurements`, `/me/progress`, `/me/goals` still work after the
   `Progress`→`ProgressView` refactor and the `GoalCard` `onToggle?` addition (the trainee goals screen shows
   no toggle). `npm run build` clean (tsc strict + vite + PWA). Django `check` clean.

---

## 8. Risks / notes

- **Onboarding conflict (memory vs epic) is the top risk.** The epic says the trainer creates trainee
  accounts; the memory says trainees self-register and the memory overrides the epic. This plan follows the
  memory (§5.3 default) and gates account-creation on an explicit override (§11 Q1). Getting this wrong means
  building a whole account-creation endpoint the product doesn't want — hence the lead question.
- **Roster N+1.** The one endpoint that fans out over many rows. Must use `annotate` (last-measured, count) +
  a single `prefetch_related` for the two latest weights, and reuse the `metrics.py` trend helper — not a
  per-trainee query and not a re-implemented trend rule (epic §3, §7 perf). Verified in step 1.
- **`is_completed` is read-only on the default serializer.** The toggle needs the dedicated
  `GoalToggleSerializer` (single writable field) selected only for `partial_update` — do not make
  `is_completed` writable on the create serializer (a trainee must not self-complete at create, P6's
  invariant). Covered in §5.2.
- **Trainer must not mutate measurements.** The API already forbids it (`MeasurementAccessPermission` PATCH/
  DELETE = owner-trainee only); P7's measurement screens must be **read-only** in the UI too so there's no
  misleading control. Verified in step 4.
- **Shared progress view.** Extracting `ProgressView` refactors a shipped P6 page — keep P6 `/me/progress`
  behavior identical (self-scoped) and verify no regression (step 8). If the developer prefers not to touch
  P6, the fallback is a P7-only progress page that duplicates the chart body (worse — flagged in §11 Q7).
- **Pagination first-page-only.** Roster and the trainee's lists read page 1 (≤50). A trainer with >50
  trainees, or a trainee with >50 measurements/photos, won't see the rest until `next`-following lands (P8
  NFR). Log/flag, don't silently truncate (consistent with P6).
- **`display_name` from `get_full_name() or username`.** The user model has no populated name/email today, so
  most roster names will be usernames. Acceptable for MVP; if real names are wanted, that's a user-profile
  change out of P7 scope.
- **SK completeness** is an AC; developer-drafted SK is acceptable for MVP but flag for native review
  (consistent with P5/P6).

---

## 11. Open questions (proposals — confirm before implementing)

- **Q1 — RESOLVED (developer, 2026-08-12):** self-registration. At signup the trainee **picks a trainer or
  chooses unassigned** (self-track), and can **link a trainer later**. No trainer account-creation, no
  `POST /api/v1/trainees`. `/trainer/trainees/new` = onboarding instructions. P7 adds the self-service
  link-later path (`PATCH /api/v1/auth/me {trainer_id|null}` + a "Your trainer" control on `/me`) — §5.3,
  AC-10. Signup pick/unassigned already works (P1).
- **Q2 — Roster trend metric = weight only.** The roster arrow needs one headline metric. **Proposal:** track
  **weight** (the palette's lead metric, `design-system.md` §2); the per-trainee overview screen shows the
  full per-metric series. *(Default: weight.)*
- **Q3 — Roster ordering.** **Proposal:** order the roster by `last_measured_at` **descending, nulls last**
  (most-recently-active trainees first; never-logged trainees at the bottom) — the trainer's natural "who
  needs attention / who just checked in" scan. *(Default: last-active first, nulls last.)*
- **Q4 — Overdue threshold = 7 days, client-side.** Consistent with P6 Q7 (no backend field). **Proposal:**
  flag overdue when `last_measured_at` is > 7 days ago or null, computed in the roster card. *(Default: 7-day
  client-side.)*
- **Q5 — Trainer measurement detail: sub-route or inline expand?** **Proposal:** a read-only detail
  sub-route `/trainer/trainees/:id/measurements/:mid` reusing the same mono readout as P6's detail, minus the
  owner Delete/Edit actions. *(Default: read-only detail sub-route.)*
- **Q6 — `PATCH`/`DELETE /api/v1/trainees/:id` (edit/remove trainee) — build or defer?** DELETE would cascade
  the trainee's measurements + blobs (destructive); the user model has no editable profile fields; account
  lifecycle is the trainee's under self-registration. **Proposal:** **defer both** (out of scope). If a
  "remove from my roster" is wanted, build a **non-destructive** detach (`head_trainer = null`, keeps the
  account + data), never a hard account delete. *(Default: defer; no destructive delete.)*
- **Q7 — Extract a shared `ProgressView` (refactor P6's `Progress`) vs a P7-only duplicate?** **Proposal:**
  extract `ProgressView({userId})`, have P6 `/me/progress` and P7 trainer progress both consume it (epic §3
  "zero duplicated logic"); verify no P6 regression. *(Default: extract shared view.)*
- **Q8 — Branch.** P5/P6 were implemented on `main`. **Proposal:** implement P7 on `main` too (consistent),
  unless you want a `feature-P7` branch. *(Default: `main`.)*

---

## 13. Post-Implementation

**Built (all §11 defaults, Q1 resolved), on `main`.**

*Backend* — additive only, **no migration** (roster is read-only aggregation; the goal toggle uses the
existing `is_completed` column):
- `core/services/roster.py` (new): `roster_queryset(trainer)` (annotate `last_measured_at`/`measurement_count`
  + `Prefetch` of each trainee's measurements newest-first, ordered most-recently-active first nulls-last) and
  `weight_summary(...)` (latest/delta/trend for weight, delegating to `core/services/metrics.py`). No raw SQL.
- `core/api/serializers.py`: `RosterEntrySerializer` (roster row + weight readout), `LinkTrainerSerializer`
  (trainee self-link/unlink), `GoalToggleSerializer` (writable `is_completed` only); `UserSerializer` extended
  with read-only `head_trainer` + `head_trainer_name`.
- `core/api/permissions.py`: `TraineeRosterPermission` (trainer-only + `can_access` object gate).
- `core/api/views.py`: `TraineeViewSet` (read-only list+retrieve), `MeView.patch` (trainee-only trainer
  link/unlink), `GoalViewSet.get_serializer_class` + detail queryset split (via `accessible_data_filter`, so a
  trainer reaches their trainee's goal for the toggle).
- `core/api/urls.py`: `goals/<int:pk>` (PATCH), `trainees`, `trainees/<int:pk>`. (`auth/me` needed no URL
  change — `MeView` is an `APIView`, so adding `patch()` was enough.)

*Frontend* — trainer cockpit inside the P5 shell: `TrainerHome` (roster), `AddTrainee` (onboarding
instructions), `TraineeOverview`, `TraineeMeasurements` + `TraineeMeasurementDetail` (read-only),
`TraineeProgress`, `PhotoCompare` (side-by-side), `TraineeGoals` (view+toggle); components `TrainerNav`,
`RosterCard`, `TrainerLink` ("Your trainer" on `/me`), shared `ProgressView` (P6 `Progress` now delegates to
it); libs `trainees.ts`, `me.ts`, `goals.ts` (`toggleGoal`), `measurements.ts` (`listPhotos`); `MeasurementCard`
gained an optional `to` link override, `GoalCard` an optional `onToggle`; `AuthProvider` gained `refreshUser`
and the `User` type gained `head_trainer`/`head_trainer_name`; `App.tsx` trainer subtree replaced the
placeholder (`TrainerHomePlaceholder.tsx` deleted); EN/SK catalogs extended (exact parity).

**Verification.** `npm run build` clean (tsc strict + vite + PWA). Django `check` + `makemigrations --check`
clean (no migration). Backend exercised in-process via DRF `APIClient` — **25/25** checks: roster scoping
(own trainees only, correct weight delta/trend/last-date, never-logged nulls), trainee→403, non-owner→404,
goal toggle (owning trainer 200 / non-owner 404 / owner trainee 200), self-service linking (link→on roster,
unlink→off, non-trainer→400, trainer→403), trainer measurement mutation→403. Roster is **3 queries for 8
trainees** (constant — not N+1). No browser-driven pass was run (no automated tests, epic §3); exercise the UI
flows in §7.

**Deviations the developer must know about:**
- **Cross-tenant access returns 404, not 403.** A trainer hitting another trainer's trainee
  (`GET /trainees/:id`) or another trainee's goal (`PATCH /goals/:id`) gets **404**, not the 403 the plan's
  §7/§2 wording implied. This is deliberate and consistent with the measurement viewset: the queryset is
  scoped by `accessible_data_filter`, so an inaccessible id is simply *not found* — no existence leak (epic
  Q6). The roster **list** still correctly 403s a non-trainer (role gate).
- **`§5.3(a) was a no-op.**` The P5 register screen already offers "— none —" (unassigned) in the trainer
  dropdown (`RegisterPage.tsx:114`), so no register-screen edit was needed. Signup pick-or-unassigned worked
  as-is; P7 only added the link-**later** path.
- **`UserSerializer` now returns two extra fields** (`head_trainer`, `head_trainer_name`) on every
  `login`/`register`/`me` response. Additive and null for trainers/unassigned trainees; the SPA `User` type
  reads them optionally.

**Follow-ups / notes:**
- **First-page-only pagination** — roster and the per-trainee lists read page 1 (≤50); `next`-following is a
  P8 NFR. A trainer with >50 trainees, or a trainee with >50 measurements/photos, sees only the first page.
- **`hips`/`body_fat_pct` chart colours** still reuse `--c-biceps`/`--c-waist` (unchanged from P6).
- **SK catalog** is developer-drafted; flag for native review (consistent with P5/P6). Unused P6 keys
  `home.trainer.{title,delta}` remain in both catalogs (harmless, parity preserved).
- **Dev users** `p7_*` were created + deleted by the in-process verification; nothing left in the dev DB.
