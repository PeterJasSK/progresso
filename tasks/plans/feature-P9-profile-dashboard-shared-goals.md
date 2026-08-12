# Feature Plan: P9 — Profile Page, Home Dashboard, Once-Set Height & Trainer-Authored Goals

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved) — **post-MVP follow-up.** P1–P8 shipped
the MVP; this plan is the first enhancement bundle on top and is **not** one of the epic's P1–P8 briefs.
**Plan ID:** P9
**Slug:** profile-dashboard-shared-goals
**Author:** Claude (Opus)
**Date:** 2026-08-12
**Status:** Complete (2026-08-12; on `main`). All §11 defaults accepted (Q1–Q8). Backend verified
in-process (22/22 DRF `APIClient` checks); `npm run build` (tsc strict + vite + PWA) + Django `check` +
`makemigrations --check` clean. See §13.

> **No GitHub issue.** ACs in §2 are quoted from the developer's request (this session), not a ticket or a
> design doc. Where the request is terse, §5 states the concrete interpretation and §11 raises the choices.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7. This plan adds no
> test files, no "test impact" section, and no per-AC test mapping.

> **Two epic overrides flagged up front** (both follow directly from the request; neither is re-litigated in
> code, only recorded here):
> 1. **Trainer may author goals for their trainees.** Epic §5 / `mvp-routes.md` §C say "create measurement/goal
>    → trainee only, always `user = self`". The request explicitly wants the trainer to *create* goals with a
>    connected trainee. This plan overrides that one rule **for goals only** (measurements stay trainee-only).
>    See **§11 Q3**.
> 2. **Height is a once-set profile attribute, not a per-measurement field.** Today `height` is a
>    `Measurement` column collected on every capture (`core/models/measurement.py:68`). The request wants it
>    "set once". This plan moves it to `CustomUser` and re-sources BMI from there. See **§11 Q1**.

---

## 0. Context this plan depends on (from P1–P8, already shipped)

### Backend contracts (consumed / changed)

- **`can_access` / `accessible_data_filter`** (`core/models/user.py:47`, `:83`) — the only access authority.
  Trainer → own trainees where `head_trainer_id == self.pk`. P9 reuses it for trainer-authored goals; adds no
  new access predicate.
- **`CustomUser`** (`core/models/user.py:23`) — `role`, `head_trainer` self-FK (`related_name="trainees"`),
  `helpers` M2M (post-MVP). **No `height` field today.** P9 adds `height_cm`.
- **`Measurement`** (`core/models/measurement.py:47`) — value fields incl. `height` DecimalField 0–300
  (`:68`); `bmi` property delegates to `metrics.bmi(self.weight, self.height)` (`:148`). P9 changes both:
  height leaves the capture surface, BMI re-sources height from the owner's profile.
- **`metrics.bmi(weight, height)`** (`core/services/metrics.py:44`) — pure, metric-only; unchanged signature.
  Callers change what they pass for `height`.
- **`chart_data.build_series`** (`core/services/chart_data.py:71`) — `_VALUE_FIELDS` includes `height`
  (`:27`); the `bmi` array is `[metrics.bmi(row.weight, row.height) for row in rows]` (`:97`). P9 drops
  `height` from `_VALUE_FIELDS` and sources BMI height from the owner profile.
- **Goal API** (`GoalViewSet`, `core/api/views.py:230`; `GoalAccessPermission`, `core/api/permissions.py:126`):
  today create is trainee-self-only — permission POST branch requires `IsTrainee` **and** `target.pk ==
  user.pk` (`permissions.py:144`), and `perform_create` forces `user=request.user` (`views.py:268`).
  `TargetUserMixin.get_target_user` (`views.py:47`) already resolves `?user=` → trainee, else self. Detail
  actions already scope via `accessible_data_filter` (`views.py:261`). Goal metrics exclude `height`/`bmi`
  (`core/models/goal.py:22`).
- **`MeView`** (`core/api/views.py`, PATCH at `:143`) — self-only, trainee-only, uses `LinkTrainerSerializer`
  (`serializers.py:47`, `trainer_id` only). P9 extends the self-edit path to also accept `height_cm`.
- **Export / delete** — `MeExportView` GET `/me/export` (`views.py:388`), `AccountDeleteView` DELETE `/me`
  (`views.py:418`), both self-only. Unchanged by P9 (only their **UI placement** moves).

### Frontend contracts (consumed / changed)

- **Routing** (`frontend/src/App.tsx:59`) — `trainee()`/`trainer()` guard helpers; no profile/settings route
  exists. P9 adds one.
- **`TraineeHome`** (`pages/TraineeHome.tsx`) — h1 `home.trainee.title`; loads `getSeries()`; renders
  `TraineeNav` → h1(+overdue pill) → `<TrainerLink>` (`:89`) → hero/secondary `StatTile`s → `<DataSection>`
  (`:134`); the "log this week" CTA is passed to `AppShell` as the **sticky bottom** `actionBar` (`:78`).
- **`TrainerHome`** (`pages/TrainerHome.tsx`) — roster; also renders `<DataSection>` (`:59`).
- **`TrainerLink`** (`components/TrainerLink.tsx`) — "Your trainer" self-service picker (`GET /auth/trainers`
  + `linkTrainer`). Rendered only on `TraineeHome`.
- **`DataSection`** (`components/DataSection.tsx`) — export (`exportData`) + typed-confirm delete
  (`deleteAccount`). Rendered on both homes.
- **`MeasurementForm`** (`pages/MeasurementForm.tsx`) — capture grid from `VALUE_METRICS`
  (`lib/metricMeta.ts:46`, = all metrics except `bmi`, **so it currently includes `height`**). P9 removes
  height from the capture grid.
- **`MeasurementsList`** (`pages/MeasurementsList.tsx`) — h1 + `measurements.logNew` CTA linking to
  `/me/measurements/new`.
- **`Avatar`** (`components/Avatar.tsx`) — presentational initials circle, **not clickable**. Rendered in the
  `AppShell` header (`AppShell.tsx:38`). P9 makes it a link to the profile page.
- **`ProgressView` + `MetricChart`** (`components/ProgressView.tsx`, `components/MetricChart.tsx`) — already
  parameterized (`userId`, `nav`, per-metric props); `MetricChart` fixed height `h-72` (`:90`). Reused for the
  dashboard mini-charts (P9 adds a size prop).
- **Goals** — `pages/Goals.tsx` has an inline add-goal form (`createGoal`); `pages/TraineeGoals.tsx` (trainer)
  is view+toggle only (`toggleGoal`), **no create form**. `GoalCard` optional `onToggle`. `GOAL_METRICS`
  (`metricMeta.ts:49`) = all except `height`/`bmi`.
- **libs** — `lib/me.ts` (`linkTrainer`, `exportData`, `deleteAccount`), `lib/measurements.ts`
  (`getSeries(userId?)`, `Series`, `Measurement` incl. `height`), `lib/goals.ts` (`createGoal(payload)`,
  `toggleGoal`, `listGoals(userId?)`), `lib/api.ts` (`get/post/patch/del/upload`).

---

## 1. Goal

Five changes, one bundle:

1. **Trainer-authored goals.** A trainer can **create** a goal for a connected trainee (not only toggle it),
   from `/trainer/trainees/:id/goals`. Backed by widening the goal-create permission + owner resolution.
2. **Home dashboard.** `/me` becomes a dashboard: the measurement snapshot **plus small per-metric graphs**
   (compact charts), not just stat tiles.
3. **Once-set height.** Height moves off the capture form to the profile page and is stored once on the user;
   BMI re-sources it from the profile.
4. **Profile page.** A new page (opened from the profile circle) that holds: **set height**, **trainer
   connection** (link/unlink), and **export + delete account** — the last two **moved off the home screens**.
5. **Clickable profile circle** + **log button by the headline.** The `Avatar` links to the profile page; the
   "log measurement" button moves to the **top, next to the h1** on `/me` and `/me/measurements` (out of the
   bottom action bar).

---

## 2. Acceptance criteria (quoted from the developer's request)

> "the trainer should be able not only see goals of trainee that they are connected to but also be able to
> create goals with them"

- [x] **AC-1** A trainer, on a connected trainee's goals screen, can **create** a goal for that trainee.
  — Covered by `core/api/permissions.py:144` (POST branch: trainee-self OR owning-trainer via `can_access`) +
  `core/api/views.py:266` (`perform_create` owner = `get_target_user`) + `frontend/src/components/GoalForm.tsx`
  (shared form, `userId` param) + `frontend/src/pages/TraineeGoals.tsx:83` (`<GoalForm userId={traineeId}>`) +
  `frontend/src/lib/goals.ts:35` (`createGoal(payload, userId?)` → `POST /goals?user=`). Verified: trainer
  authors → 201 owned by trainee, active; non-owner trainer → denied; trainee-for-other → denied.

> "lets rework home part there should be home where there are some sort of dashboard where you can see
> measurements and some small graphs"

- [x] **AC-2** `/me` renders a **dashboard**: snapshot tiles **and small per-metric graphs**.
  — Covered by `frontend/src/pages/TraineeHome.tsx:99-160` (hero+secondary `StatTile`s + a compact
  `MetricChart` grid for weight/waist/chest with ≥2 points, else `progress.needMore`) +
  `frontend/src/components/MetricChart.tsx:90` (new `size='compact'` → `h-40`). Reuses the single loaded
  `getSeries()` — no extra fetch.

> "the height should be something that is set once not measured every time"

- [x] **AC-3** Height is a once-set profile attribute, off the capture form; BMI sources it from the profile.
  — Covered by `core/models/user.py:47` (`height_cm` field 50–250, nullable) +
  `core/migrations/0006_customuser_height_cm.py` (AddField + `RunPython` backfill from latest measured height)
  + `core/models/measurement.py:154` (`bmi` = `metrics.bmi(self.weight, self.user.height_cm)`) +
  `core/services/chart_data.py:27,97` (height dropped from `_VALUE_FIELDS`; bmi array from owner `height_cm`) +
  `core/api/serializers.py` (height dropped from `MeasurementSerializer` fields/`_VALUE_FIELDS`/`_BANDS`) +
  `frontend/src/lib/metricMeta.ts:46` (height dropped from `VALUE_METRICS` → capture grid). Verified: BMI
  24.7 from 80kg×1.8m, recomputes on profile-height change, `height` in a POST body ignored, series has no
  height metric.

> "the connection from trainee to trainer should be in sort of profile page and there you can set height the
> connection to trainee [trainer] and export and delete account move to the profile page"

- [x] **AC-4** A **profile page** holds set height + trainer connection + export/delete; the last two are
  removed from the home screens. — Covered by `frontend/src/pages/ProfilePage.tsx` (`HeightSection` →
  `updateProfile({height_cm})` + `refreshUser`, `<TrainerLink/>`, `<DataSection/>`; trainee-only sections
  role-gated) + `frontend/src/lib/me.ts:updateProfile` + `core/api/serializers.py:ProfileUpdateSerializer`
  (optional `trainer_id`+`height_cm`) + `core/api/views.py:150` (`MeView.patch`). Removed from home:
  `frontend/src/pages/TraineeHome.tsx` (no `TrainerLink`/`DataSection`), `frontend/src/pages/TrainerHome.tsx`
  (no `DataSection`). Verified: height set/clear/out-of-range, combined trainer+height PATCH.

> "profile page should open if you click on the profile circle"

- [x] **AC-5** Clicking the **profile circle** opens the profile page. — Covered by
  `frontend/src/components/AppShell.tsx:38` (header `Avatar` wrapped in `<Link to="/profile">` with focus ring)
  + `frontend/src/App.tsx` (`/profile` route, `authed()` guard — both roles). The `RosterCard` avatar stays
  non-linked (identifies a trainee, not the viewer).

> "and the log or measurement button should be at the top of the page right next to the h1 headline of Your
> progress or My measurements"

- [x] **AC-6** The "log measurement" button sits at the top next to the h1 on `/me` and `/me/measurements`,
  not the bottom bar. — Covered by `frontend/src/pages/TraineeHome.tsx:80-92` (h1 row with `ml-auto` Button,
  no `actionBar`) + `frontend/src/pages/MeasurementsList.tsx:28-39` (h1 row with `ml-auto` `measurements.logNew`
  Button, no `actionBar`).

- [x] **AC-7 (carried invariants)** — No hardcoded hex (colors via token utilities / `--c-*` vars); new strings
  via `t()` with **complete EN↔SK parity** (script-verified 0 missing/extra — `nav.profile`, `home.charts.*`,
  `profile.*`); numbers/dates mono; goal-create access through `can_access`; no raw SQL (ORM backfill); strict
  types both sides. `npm run build` clean; Django `check` + `makemigrations --check` clean.

---

## 3. Out of scope (do not build in P9)

- **Trainer creating/editing measurements, or editing a trainee's goal content** beyond create + the existing
  toggle. The only new goal write is trainer **create**; measurements stay trainee-only (API already forbids
  trainer mutation).
- **Trainer editing a trainee's height.** Height is the trainee's own profile attribute (self-edit only), like
  the trainer link. A trainer does not set a trainee's height.
- **Dropping the `Measurement.height` DB column / a destructive migration.** Default is to keep the column
  (deprecated, non-destructive) — see §11 Q1. No historical-height chart is added.
- **A trainer dashboard rework.** The request targets the (trainee) "home"; the trainer roster stays as-is
  except that `DataSection` moves off it to the profile page (§5.5). See §11 Q5.
- **Goal edit/delete UI**, goal auto-progress from measurements, reminders/notifications — all post-MVP.
- **Height on the progress charts** as a plotted metric (it is now constant — a flat line adds nothing).
- **BMI as a settable/goal metric** — unchanged (`goal.py` still excludes it).

---

## 4. Cross-cutting decisions adopted (from epic §3, not re-litigated)

- React + Tailwind; **tokens the single source, no hardcoded hex**.
- Session auth + CSRF via the existing handshake; the new writes go through `api.patch`/`api.post` (CSRF auto).
- **Numbers/dates mono**; Orbitron headings; Inter elsewhere.
- **i18n from day one** — no hardcoded strings; EN base + complete SK; locale-aware formatting.
- **One authorization predicate** — trainer-authored goals resolve through `can_access` only; no inline
  `if role ==` **data** check (the POST **role gate** — "who may create at all" — is a role check, which is
  allowed and already how `GoalAccessPermission` is shaped).
- **API-first**, **layered backend**, **no raw SQL** (BMI backfill via the ORM), **host-agnostic**.

---

## 5. Design / approach

### 5.1 Once-set height on the profile (`CustomUser.height_cm`)

**Model** — add to `CustomUser` (`core/models/user.py`):
```python
height_cm = models.DecimalField(
    max_digits=5, decimal_places=1, null=True, blank=True,
    validators=[MinValueValidator(Decimal("50")), MaxValueValidator(Decimal("250"))],
)
```
(Range mirrors the measurement height band `serializers.py:308`. Nullable — a user may not have set it yet;
BMI is `None` until they do, exactly as today when height was absent.)

**Migration** — two operations, one migration file:
1. `AddField` `height_cm`.
2. A **data migration** (`RunPython`, reversible no-op backward) backfilling each user's `height_cm` from
   their **most recent measurement with a non-null `height`** — ORM only (`Measurement.objects.filter(
   user=u, height__isnull=False).order_by("-measured_at", "-created_at").values_list("height", flat=True)
   .first()`), no raw SQL. Users with no height history stay `NULL`.

**BMI re-sourcing** — height now comes from the owner, not the row:
- `Measurement.bmi` property (`measurement.py:148`) → `metrics.bmi(self.weight, self.user.height_cm)`. To
  avoid an N+1 on list serialization, ensure measurement querysets that serialize `bmi` use
  `select_related("user")` (the list/detail viewset querysets — add `select_related("user")` where missing).
- `chart_data.build_series` (`chart_data.py`): remove `"height"` from `_VALUE_FIELDS` (`:27`) so height is no
  longer a plotted per-row metric; compute the bmi array from the **owner's** height once:
  `height = rows[0].user.height_cm` then `columns["bmi"] = [metrics.bmi(row.weight, height) for row in rows]`.
  Callers pass an owner-loaded queryset (`select_related("user")`); the series view already scopes to one user.
- `metrics.bmi` signature is unchanged.

**Capture form** — height leaves the writable measurement surface:
- Serializer (`MeasurementSerializer`, `serializers.py:210`): drop `height` from the writable value-fields
  tuple (`:295`) and its validation band (`:308`), and from the serialized `fields` list (`:253`) **or** keep
  it read-only (see §11 Q1 default: **drop from writable + fields**, keep the DB column). Keep `unit_system`,
  `measured_at`, the other metrics, and `bmi` (read-only, now profile-sourced).
- The `Measurement.height` **column stays** (deprecated, non-destructive; §11 Q1). No `DROP` migration.

**Set-height API** — extend the existing self-edit PATCH:
- `LinkTrainerSerializer` → rename/generalize to `ProfileUpdateSerializer` (`serializers.py:47`), accepting
  **optional** `trainer_id` (existing rule) **and** optional `height_cm` (Decimal, same 50–250 validators,
  `null` allowed to clear). Both fields optional → a request may set either or both. Self-only, trainee-only
  (unchanged scope: `MeView.patch`, `views.py:143`). Returns the updated `UserSerializer` (which gains
  `height_cm`, read below).
- `UserSerializer` (`serializers.py`): add read-only `height_cm` so the SPA `User` carries it (additive; null
  for anyone who hasn't set it, and for trainers).

### 5.2 Trainer-authored goals (`POST /api/v1/goals?user=:id` by a trainer)

Widen create from trainee-self-only to **trainee-self OR owning-trainer**, resolving the owner through the
existing target/`can_access` machinery — no new predicate.

- **`GoalAccessPermission.has_permission` POST branch** (`permissions.py:144`) — replace the `IsTrainee` +
  `target.pk == user.pk` gate with:
  ```python
  if request.method == "POST":
      target = view.get_target_user(request)          # ?user= -> trainee, else self
      if not user.can_access(target):                 # single access authority
          return False
      if user.role == Role.TRAINEE:
          return target.pk == user.pk                 # trainee: own goals only
      if user.role == Role.TRAINER:
          return target.pk != user.pk                 # trainer: a trainee they own (can_access ⇒ ownership)
      return False
  ```
  (`can_access(target)` already encodes trainer→own-trainee; the `target.pk != user.pk` guard stops a trainer
  authoring a goal "for themselves". Trainee path unchanged in effect.)
- **`GoalViewSet.perform_create`** (`views.py:268`) — owner is the **target**, not always the caller:
  `serializer.save(user=self.get_target_user(self.request))`. For a trainee (no `?user=` or `?user=self`) this
  is still self; for a trainer it is the addressed trainee. The permission has already asserted access.
- **`get_queryset` `list`** already filters to `get_target_user` — a trainer listing `?user=:id` sees that
  trainee's goals (already works; consumed by the trainer goals screen today).
- **No new route, no model/serializer change** for goals — `GoalSerializer` create shape is reused; the metric
  set (excl. height/bmi) is unchanged. `is_completed` stays create-read-only (a trainer authors an **active**
  goal; completion is the separate toggle).

### 5.3 Profile page — new route + screen

**Route** (`App.tsx`): add `path="/profile"` under **`RequireAuth` only** (both roles), element
`<ProfilePage />`. (Single shared route; content is role-conditional — see §11 Q2. Alt: separate
`/me/profile` + `/trainer/profile`.)

**`pages/ProfilePage.tsx`** (new) — inside `AppShell`, sections:
1. **Height** (trainee only) — a single numeric (mono) input for `height_cm` with a Save action →
   `updateProfile({ height_cm })` (§5.6). Shows the current value or an empty state. (Trainers: hidden — no
   BMI relevance; §11 Q7.)
2. **Your trainer** (trainee only) — reuse the existing **`<TrainerLink />`** component verbatim (moved here
   from `TraineeHome`).
3. **Your data** (all roles) — reuse the existing **`<DataSection />`** component (moved here from both homes).

A minimal back/nav affordance (the standard `AppShell` header + a link back to the role home) — no new nav
component needed. All copy via i18n.

### 5.4 Clickable profile circle (`Avatar` → `/profile`)

- **`Avatar`** (`components/Avatar.tsx`) stays presentational; wrap its usage in the header
  (`AppShell.tsx:38`) in a `react-router` `<Link to="/profile" aria-label={t('nav.profile')}>`. Give it a
  focus ring / hover affordance via token utilities (no hex). Keep the `RosterCard` avatar usage
  (`RosterCard.tsx:46`) **non-linked** (that avatar identifies a trainee, not the current user) — so wrap at
  the header call-site, not inside `Avatar` itself.

### 5.5 Home dashboard rework (`/me`)

**`pages/TraineeHome.tsx`** — reshape into a dashboard:
- **Header row:** h1 `home.trainee.title` ("Your progress") + the overdue `Pill` (kept) + a **top-right "Log
  measurement" button** (`home.logThisWeek`, links `/me/measurements/new`). Remove the `AppShell` `actionBar`
  CTA (AC-6 — log button moves to the headline row).
- **Snapshot:** keep the hero + secondary `StatTile`s (weight / waist / chest) — the "see measurements" part.
- **Small graphs (AC-2):** below the tiles, a compact grid of **mini charts** — one small `MetricChart` per
  key metric (weight, waist, chest — the same trio, §11 Q4), fed from the already-loaded `getSeries()`
  (`series.metrics[key]` + `series.dates`), rendered only when that metric has `>= 2` points (else a
  "need more data" hint, reusing `progress.needMore`). Each mini chart links/deep-links to
  `/me/progress` for the full view.
- **Removed from home:** `<TrainerLink>` and `<DataSection>` (both now on `/profile`, AC-4). A small "Manage
  profile / trainer / data" link can point to `/profile` (or rely on the avatar, AC-5 — §11 Q6).

**`components/MetricChart.tsx`** — add an optional size prop so the same chart renders compact on the
dashboard and full-height on `/me/progress`:
```tsx
{ ...existing, size?: 'full' | 'compact' }   // height class h-72 (full, default) | h-40 (compact)
```
No color/logic change; `ProgressView` keeps the default (`full`).

**`pages/MeasurementsList.tsx`** (AC-6) — move the `measurements.logNew` CTA into the h1 row (top-right, next
to "My measurements"); drop it from wherever it currently sits below/bottom.

### 5.6 Frontend lib changes

- **`lib/me.ts`** — add `updateProfile(patch: { trainer_id?: number | null; height_cm?: number | null }):
  Promise<User>` → `api.patch<User>('/auth/me', patch)`. Keep `linkTrainer` as a thin wrapper over it (or
  reimplement `TrainerLink` to call `updateProfile({ trainer_id })`) — one PATCH path, no duplication.
- **`auth/AuthProvider` `User` type** — add optional `height_cm?: number | null` (additive; server now returns
  it).
- **`lib/goals.ts`** — `createGoal(payload: GoalInput, userId?: number)` → `POST /goals` with `?user=:id` when
  `userId` is given (trainer authoring for a trainee); self when omitted (trainee). One function, optional
  param — mirrors `listGoals(userId?)`.
- **`lib/measurements.ts`** — `Measurement.height` stays typed (the column persists) but is no longer sent by
  the form; no signature change required. `Series` unchanged (height simply won't appear in `metrics`).

### 5.7 Trainer goal-create UI

- Extract the inline add-goal form from `pages/Goals.tsx` into a shared **`components/GoalForm.tsx`**
  (`{ userId?: number; onCreated: (g: Goal) => void }`) — the metric/target/direction/date/description form,
  submitting via `createGoal(payload, userId)`. `Goals.tsx` (trainee) uses it with no `userId`; refactor it to
  delegate (mirror the P7 `Progress`→`ProgressView` extraction — zero duplicated logic, epic §3).
- **`pages/TraineeGoals.tsx`** (trainer) — add `<GoalForm userId={traineeId} onCreated={refetch} />` above the
  goal list, so a trainer can author a goal for the trainee (AC-1). Toggle behavior unchanged.

### 5.8 i18n (`i18n/en.json` + `sk.json`, exact parallel — AC-7)

New keys (both catalogs): `nav.profile`; `profile.*` (title, height section label + placeholder + save,
trainer section heading if not reusing `home.trainer.*`, data section heading if not reusing `data.*`,
back-to-home link); `home.miniCharts.*` (section heading, per-chart "view full" link) as needed;
`profile.height.*` (label, unit `cm`, save, empty/"not set"). **Reuse** existing `home.trainer.*`, `data.*`,
`metrics.*`, `goals.add.*`, `progress.needMore`, `home.logThisWeek`, `measurements.logNew` where the same
content is shown — do not duplicate. SK is developer-drafted (flag for native review, consistent with P5–P7).

---

## 6. File Plan

Backend: Python, `from __future__ import annotations`, full hints, PEP 8, **no raw SQL** (backfill via ORM).
Frontend: TS/TSX strict, no hardcoded hex, no user-facing string literal outside the i18n catalogs.

| File | Change | Notes |
|------|--------|-------|
| `core/models/user.py` | edit | add `height_cm` DecimalField (50–250, nullable) (§5.1) |
| `core/models/measurement.py` | edit | `bmi` property sources `self.user.height_cm` (§5.1) |
| `core/services/chart_data.py` | edit | drop `height` from `_VALUE_FIELDS`; bmi array from owner `height_cm` (§5.1) |
| `core/api/serializers.py` | edit | `LinkTrainerSerializer`→`ProfileUpdateSerializer` (+`height_cm`); `UserSerializer` read-only `height_cm`; drop `height` from `MeasurementSerializer` writable/fields (§5.1) |
| `core/api/permissions.py` | edit | `GoalAccessPermission` POST branch: trainee-self OR owning-trainer via `can_access` (§5.2) |
| `core/api/views.py` | edit | `GoalViewSet.perform_create` → owner = `get_target_user`; measurement/goal querysets `select_related("user")` where bmi serializes; `MeView.patch` uses `ProfileUpdateSerializer` (§5.1, §5.2) |
| `core/migrations/00xx_*.py` | new | `AddField height_cm` + `RunPython` backfill from latest measurement height (§5.1) |
| `frontend/src/App.tsx` | edit | add `/profile` route (RequireAuth, both roles) (§5.3) |
| `frontend/src/pages/ProfilePage.tsx` | new | height + `TrainerLink` + `DataSection` (§5.3) |
| `frontend/src/components/AppShell.tsx` | edit | wrap header `Avatar` in `<Link to="/profile">` (§5.4) |
| `frontend/src/pages/TraineeHome.tsx` | edit | dashboard: log button by h1, mini-chart grid; remove `TrainerLink`+`DataSection`+bottom actionBar (§5.5) |
| `frontend/src/pages/TrainerHome.tsx` | edit | remove `DataSection` (moved to `/profile`) (§5.5) |
| `frontend/src/pages/MeasurementsList.tsx` | edit | log CTA into the h1 row (§5.5, AC-6) |
| `frontend/src/pages/MeasurementForm.tsx` | edit | drop `height` from the capture grid (§5.1) |
| `frontend/src/components/MetricChart.tsx` | edit | optional `size?: 'full'\|'compact'` height prop (§5.5) |
| `frontend/src/components/GoalForm.tsx` | new | shared add-goal form (`userId?`, `onCreated`) (§5.7) |
| `frontend/src/pages/Goals.tsx` | edit | delegate to `GoalForm` (no `userId`) (§5.7) |
| `frontend/src/pages/TraineeGoals.tsx` | edit | add `<GoalForm userId={traineeId}>` (trainer authors) (§5.7, AC-1) |
| `frontend/src/lib/me.ts` | edit | `updateProfile({trainer_id?, height_cm?})`; keep `linkTrainer` thin (§5.6) |
| `frontend/src/lib/goals.ts` | edit | `createGoal(payload, userId?)` (§5.6) |
| `frontend/src/auth/AuthProvider.tsx` | edit | `User` gains optional `height_cm` (§5.6) |
| `frontend/src/lib/metricMeta.ts` | edit (maybe) | if the capture grid keys off `VALUE_METRICS`, exclude `height` there (or filter in the form) (§5.1) |
| `frontend/src/i18n/en.json` | edit | new keys (§5.8) |
| `frontend/src/i18n/sk.json` | edit | new keys, complete parallel (§5.8) |

One backend migration (height field + backfill). No `CLAUDE.md` change. No test files (epic §3).

---

## 7. Manual verification (no automated tests — epic §3)

Backend (`python manage.py migrate && runserver`) + Vite (`cd frontend && npm run dev`). Need a **trainer**,
an **owned trainee** (with ≥2 measurements, one with a photo, and a pre-existing `height` on an old row), and
a **second trainer** (for the deny check).

1. **Height backfill + BMI (AC-3).** After `migrate`, the owned trainee's `height_cm` = their latest
   measured height (check `/admin/`). Their measurement detail/list still shows a correct **BMI** (weight ×
   profile height). A user with no height history → `height_cm` NULL, BMI absent (unchanged behavior).
2. **Set height on profile (AC-3, AC-4).** As the trainee, open **`/profile`**, set/clear height →
   `PATCH /auth/me {height_cm}` succeeds; the new value flows into BMI on the next measurement view and the
   dashboard. Trainee cannot set another user's height (endpoint always edits `request.user`); out-of-range
   (e.g. 500) → validation error key. A **trainer's** `/profile` shows **no** height section (§11 Q7).
3. **Capture form has no height (AC-3).** `/me/measurements/new` grid has **no height input**; logging a
   measurement still works (weight/waist/etc + photo); `POST /measurements` with a `height` in the body is
   ignored/rejected (dropped from the writable serializer).
4. **Trainer authors a goal (AC-1).** As the trainer on `/trainer/trainees/:id/goals`, use the add-goal form
   → `POST /goals?user=:id` → 201, the goal is owned by the **trainee** and appears on the trainee's own
   `/me/goals`. As the **second** trainer, `POST /goals?user=<not-mine>` → **denied** (can_access). A trainee
   still creates only their own goals (`POST /goals` self; `?user=other` → denied).
5. **Home dashboard (AC-2, AC-6).** `/me` shows the snapshot tiles **and** a grid of **small charts**
   (weight/waist/chest) over history; a metric with <2 points shows the need-more hint. The **"Log
   measurement" button is in the h1 row** (top), not the bottom bar. `TrainerLink` and `DataSection` are
   **gone** from `/me`.
6. **Measurements list (AC-6).** `/me/measurements` — the log CTA sits **next to "My measurements"** at the
   top.
7. **Profile via the circle (AC-4, AC-5).** Clicking the **avatar** in the header opens `/profile`. It holds:
   height (trainee), **Your trainer** (link/change/unlink → appears/disappears on the trainer's roster), and
   **Your data** (export downloads the JSON; delete behind the typed-confirm word still deletes + logs out).
   Export/delete are **absent** from `/me` and `/trainer`.
8. **i18n + tokens (AC-7).** EN→SK flips **every** new string (profile, height, mini-chart labels, goal-form
   on the trainer screen). Grep new `.tsx`/`.ts` for user-facing literals → none; for hex → none. `npm run
   build` clean; Django `check` + `makemigrations --check` clean (the one new migration committed).
9. **No regression.** Trainee `/me/goals` create + toggle still work; trainer goal toggle still works; progress
   charts unchanged (minus height, which was never a useful line); roster unaffected.

---

## 8. Risks / notes

- **BMI N+1 on list.** `Measurement.bmi` now reads `self.user.height_cm`; serializing a page of measurements
  without `select_related("user")` fires one query per row. Add `select_related("user")` to the measurement
  list/detail and series querysets. Verify query count is constant (step 1/5).
- **Height backfill is lossy by design.** Only the *latest* per-row height carries forward to the single
  profile value; older differing heights are not retained (height is meant to be constant — this is the point).
  Non-destructive: the `Measurement.height` column is kept (§11 Q1), so the raw history is still in the DB if
  ever needed.
- **Trainer goal-create overrides an epic rule.** Epic §5 said create is trainee-only; this plan widens it for
  goals per the explicit request. Kept auditable: still a single `can_access` gate, and measurements are
  untouched. If the developer wants to *keep* the epic rule, drop AC-1 (§11 Q3).
- **Profile route shared by both roles.** A single `/profile` under `RequireAuth` renders role-conditional
  sections (trainer sees only data). If cleaner separation is wanted, split into `/me/profile` + `/trainer/
  profile` (§11 Q2) — more routes, same components.
- **`is_completed` stays create-read-only.** A trainer authors an **active** goal; they cannot mark it done at
  creation — completion remains the separate toggle (P7). Don't make `is_completed` writable on create.
- **Mini-charts reuse the loaded series** — no extra fetch on `/me` (still one `getSeries()` call). Keep them
  cheap; render at most the trio, guarded by `>= 2` points.
- **SK completeness** is an AC; developer-drafted SK acceptable for now, flag for native review.

---

## 11. Open questions — RESOLVED (developer accepted all defaults, 2026-08-12)

- **Q1 — Height storage & the old column.** **Proposal:** add `CustomUser.height_cm`, backfill from the
  latest measurement height, **remove height from the capture form + writable serializer**, and **keep** the
  `Measurement.height` column deprecated (non-destructive — no data loss, no drop migration). *(Default: add
  field + backfill + keep old column deprecated.)* Alt: hard-drop the column (destructive migration).
- **Q2 — Profile route shape.** **Proposal:** one shared **`/profile`** under `RequireAuth`, role-conditional
  content (trainer sees only export/delete). *(Default: single `/profile`.)* Alt: `/me/profile` +
  `/trainer/profile`.
- **Q3 — Confirm the trainer-authored-goal override.** The request asks for it; the epic said create is
  trainee-only. **Proposal:** implement AC-1 (trainer creates goals for owned trainees via `can_access`),
  overriding the epic rule **for goals only**. *(Default: implement it.)*
- **Q4 — Which metrics get a mini-chart on the dashboard?** **Proposal:** the existing hero+secondary trio —
  **weight, waist, chest** — each a compact line chart when it has ≥2 points. *(Default: that trio.)* Alt: all
  present metrics, or user-selectable.
- **Q5 — Trainer home.** The request says "home"; the trainer's home is the roster. **Proposal:** leave the
  roster as-is; only move `DataSection` off it to `/profile`. *(Default: roster unchanged.)*
- **Q6 — Getting to the profile without the avatar.** The avatar is the primary entry (AC-5). **Proposal:**
  also add a small "Profile" text link on `/me` (and it's reachable on `/trainer` via the same header avatar).
  *(Default: avatar is primary; add a secondary text link on the trainee home.)*
- **Q7 — Height section for trainers?** Trainers have no measurements/BMI. **Proposal:** hide the height
  section for trainers; show it only for trainees. *(Default: trainee-only.)*
- **Q8 — Branch.** P5–P8 shipped on `main`. **Proposal:** implement P9 on `main` too. *(Default: `main`.)*

---

## 13. Post-Implementation

**Built (all §11 defaults, Q1–Q8), on `main`.**

*Backend* — one additive migration (`0006_customuser_height_cm.py`: AddField `height_cm` + `RunPython`
backfill from each user's latest measured height, reverse no-op):
- `core/models/user.py`: `height_cm` DecimalField (50–250, nullable) — the once-set profile height.
- `core/models/measurement.py`: `bmi` property now `metrics.bmi(self.weight, self.user.height_cm)`.
- `core/services/chart_data.py`: `height` dropped from `_VALUE_FIELDS`; BMI array from the owner's single
  `height_cm` (read once; querysets already `select_related("user")`, so no N+1).
- `core/api/serializers.py`: `LinkTrainerSerializer` → `ProfileUpdateSerializer` (optional `trainer_id` **and**
  `height_cm`, both self-only); `UserSerializer` gains read-only `height_cm`; `MeasurementSerializer` drops
  `height` from its `fields`/`_VALUE_FIELDS`/`_BANDS`.
- `core/api/permissions.py`: `GoalAccessPermission` POST widened — trainee-self OR owning-trainer, gated by
  `can_access(get_target_user)`.
- `core/api/views.py`: `GoalViewSet.perform_create` owner = `get_target_user`; `MeView.patch` uses
  `ProfileUpdateSerializer`.

*Frontend* — `ProfilePage` (`/profile`, `authed()` guard, role-conditional: height + `TrainerLink` for
trainees, `DataSection` for all); header `Avatar` now links to `/profile`; `TraineeHome` reshaped into a
dashboard (log button by the h1, compact `MetricChart` grid) with `TrainerLink`/`DataSection` removed;
`MeasurementsList` log CTA moved to the h1 row; `TrainerHome` drops `DataSection`; shared `GoalForm` (P6
`Goals` delegates to it, trainer `TraineeGoals` mounts it with `userId`); `MetricChart` gains
`size='compact'`; libs `me.ts` (`updateProfile`, `linkTrainer` thin wrapper), `goals.ts`
(`createGoal(payload, userId?)`), `metricMeta.ts` (`VALUE_METRICS` excludes height); `User` type gains
`height_cm`; EN/SK catalogs extended (exact parity — `nav.profile`, `home.charts.*`, `profile.*`).

**Verification.** `npm run build` clean (tsc strict + vite + PWA). Django `check` + `makemigrations --check`
clean; migration applied. Backend exercised in-process via DRF `APIClient` — **22/22**: BMI from profile
height (and recompute on change), height PATCH set/clear/out-of-range, combined trainer+height PATCH, trainer
PATCH `/auth/me` → 403, capture ignores a body `height` (not stored, not serialized), trainer authors goal for
owned trainee → 201 (owned by trainee, active), non-owner trainer/trainee-for-other → denied, trainee authors
own goal, series has no `height` metric but has `bmi`. Dev `p9_*` users created + deleted by the run. No
browser-driven pass (no automated tests, epic §3) — exercise the UI flows in §7.

**Deviations / notes the developer must know:**
- **Cross-owner goal-create returns 403 (role/target gate), not 404.** The POST permission denies before
  object lookup, so an out-of-roster `?user=` gives 403 (unlike the detail routes' 404). No existence leak
  either way. Verified accepting either.
- **`Measurement.height` column kept (deprecated), per Q1.** It is no longer written or serialized; historical
  values remain in the DB. No destructive drop migration.
- **Backfill is lossy by design** — only each user's latest measured height seeds the single `height_cm`.
- **`UserSerializer` now returns `height_cm`** (string, DRF decimal coercion) on every login/register/me — null
  for trainers and unset trainees; the SPA `User` reads it optionally.
- **SK catalog** is developer-drafted; flag for native review (consistent with P5–P8).
- **Unused legacy keys** `home.trainer.{title,delta}` remain (pre-existing; parity preserved).
