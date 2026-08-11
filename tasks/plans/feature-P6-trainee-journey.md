# Feature Plan: P6 — Trainee Journey

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved)
**Plan ID:** P6
**Slug:** trainee-journey
**Author:** Claude (Opus)
**Date:** 2026-08-11
**Status:** Complete (2026-08-11; all §11 defaults Q1–Q8 accepted; implemented on `main`)

> No GitHub issue. ACs are quoted from the design docs (`tasks/design/*.md`) via the epic §9 P6 brief.
> `design-preview.html` is the rendered visual reference (authoritative for exact look). There are **no
> ticket images**; the design source is the three docs in `tasks/design/`.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7. This plan does
> not add test files, a "test impact" section, or per-AC test mapping.

---

## 0. Context this plan depends on (from P1–P5, already shipped)

P6 builds the trainee-facing screens **inside** the P5 shell, consuming the P2/P3/P4 APIs exactly as built.
The only backend work P6 itself adds is the **Goal** stack (model + list/create API), which the epic assigns
to P6 (epic §4 "Goal … Introduced by P6/P7"). Everything else is frontend.

### Backend contracts consumed (do not change)

- **Measurement model** (`core/models/measurement.py`): value fields `weight, height, chest, waist, hips,
  biceps, thigh, calf, body_fat_pct` (all `DecimalField`, nullable), plus `unit_system` (default `"metric"`),
  `measured_at` (`DateField`, editable, defaults to today), `created_at` (immutable), `photo_url`,
  `thumbnail_url` (both `CharField`, `""` = none), and a computed `bmi` property (1 dp, `None` if
  weight/height missing). `Meta.ordering = ["-created_at"]` (newest-first).
- **Measurement API** (`/api/v1/measurements`, `MeasurementViewSet`):
  - `GET /api/v1/measurements?user=:id` → array of measurement objects. Trainee omits `user` (defaults to
    self). Serializer fields: `id, user, unit_system, weight, height, chest, waist, hips, biceps, thigh,
    calf, body_fat_pct, measured_at, created_at, bmi, photo_url, thumbnail_url` (plus write-only `photo`).
  - `POST /api/v1/measurements` (**multipart**, trainee only): value fields + `unit_system` + `measured_at`
    + write-only `photo` (`ImageField`, optional). `user` is forced to `request.user` server-side (body
    `user` ignored). At least one value field required or error key `no_values`. Range errors → key
    `out_of_range`; bad image → `invalid_image` / `photo_too_large`.
  - `GET /api/v1/measurements/:id` → one object (owner trainee, or trainer who owns the trainee).
  - `PATCH /api/v1/measurements/:id` (**owner trainee only**) → edit. Trainer can read but not mutate.
  - `DELETE /api/v1/measurements/:id` (**owner trainee only**) → removes row; a `post_delete` signal
    (`core/services/blob_cleanup.py`) cleans the blob.
  - `GET /api/v1/measurements/series?user=:id` → `{ user, unit_system, dates:[iso...ascending],
    metrics:{ <metric>:[num|null,...] }, summary:{ <metric>:{latest, delta, trend:"up"|"down"|"flat"|null} } }`.
    `metrics` keys = the value fields **plus** `bmi`; a metric all-null is omitted. Values are JSON numbers.
  - `GET /api/v1/measurements/photos?user=:id` → array of **full measurement objects** that have a photo
    (`photo_url != ""`), serialized with the same `MeasurementSerializer`. (Compare picker is P7; P6 only
    consumes photos for detail/history display.)
- **Auth/permissions** (`core/api/permissions.py`, `core/models/user.py`): every non-auth endpoint runs
  through `user.can_access(target)` (the single predicate). `MeasurementAccessPermission`: create = trainee
  + self; list = `can_access(target)`; object SAFE = `can_access(obj.user)`; PATCH/DELETE = owner-trainee
  only. `CustomUser.role` ∈ `{trainee, trainer, admin, helper}`; SPA sees only `trainee`/`trainer`.
- **Pagination**: none configured — list/photos/goals endpoints return **plain arrays**, not paginated
  envelopes. (NFR pagination is deferred to P8 per epic §9 P8; P6 consumes arrays.)

### Frontend contracts consumed (from P5)

- **API client** (`frontend/src/lib/api.ts`): `api.get<T>(path)`, `api.post<T>(path, body?, anonymous?)`.
  `ApiError` carries `.status` and `.key`; callers localize via `t('errors.<key>')`. Unsafe requests
  auto-attach `X-CSRFToken` (via `ensureCsrf()` + `getCookie`). **No `patch`, `del`, or multipart/upload
  helper exists yet** — P6 adds them (§5.7).
- **Auth**: `useAuth()` → `{ user, loading, login, register, logout }`; `user = {id, username, role}`.
  `roleHome(role)` → `/me` | `/trainer`.
- **Component kit** (`frontend/src/components/`): `Button({variant})`, `Card`, `Input({numeric})`,
  `StatTile({label, value, delta?, deltaLabel?, trend?})`, `Pill({variant})`, `Avatar({name})`,
  `AppShell({children, actionBar?})` (**has a bottom action-bar slot**), `Spinner`, `ThemeToggle`,
  `LanguageSwitcher`.
- **i18n** (`frontend/src/i18n/`): `useTranslation()` → `t('dotted.key')`; catalogs `en.json` (base) +
  `sk.json` (complete). Helpers `formatNumber(n)` and `formatDate(v)` keyed to active locale.
- **Routing** (`frontend/src/App.tsx`): `/me` currently renders `TraineeHomePlaceholder` under
  `RequireAuth > RequireRole role="trainee"`. P6 replaces that subtree with the real trainee routes.
- **Tokens** (`frontend/tailwind.config.ts` + `frontend/src/styles/tokens.css`): utilities `bg-*`,
  `text-*`, `border-*` for `bg/surface/text/heading/muted/accent/primary/border/success/danger/warn`;
  `font-display|sans|mono`; `rounded-sm|md|lg|pill`; `shadow-card|glow`. Chart palette lives as CSS custom
  properties `--c-weight, --c-chest, --c-waist, --c-biceps, --c-thigh, --c-calf` in `tokens.css` (added in
  P5, not exposed as Tailwind utilities — Chart.js reads them via `getComputedStyle`).
- **Deps** (`frontend/package.json`): React 18, react-router-dom 6, react-i18next. **Chart.js and TanStack
  Query are NOT installed** — P6 adds Chart.js (§5.6, §11 Q1); data-fetching stays raw `api` + local hooks
  (§11 Q2).

---

## 1. Goal

Deliver everything a trainee navigates — the frame P5 built now gets its trainee body:

- **`/me` home** — latest measurement as a hero stat tile, a trend snapshot (deltas + arrows from the series
  summary), and a "log this week" next-action CTA (nudged when overdue).
- **`/me/measurements`** — the full list of the trainee's own entries, newest-first, as cards.
- **`/me/measurements/new`** — the **core capture form**: numeric inputs + photo, mobile-first, primary CTA
  in the bottom action bar, submittable in under 30 seconds. Multipart POST.
- **`/me/measurements/:id`** — one entry: all values (JetBrains Mono), the full photo, BMI, with delete
  (and edit, §11 Q4) for the owner.
- **`/me/progress`** — charts over time per metric (Chart.js against the P4 series endpoint), metric
  selectable, brand-tokened colors and mono tick labels.
- **`/me/goals`** — list the trainee's goals and add a new one (the **new Goal model + GET/POST API** this
  plan introduces).

Plus the enabling plumbing: the **Goal backend stack**, and the frontend API client's `patch`/`del`/upload
helpers and resource modules.

`/me/chat` is **P8** (out of scope, §3).

---

## 2. Acceptance criteria (quoted from design docs via epic §9 P6)

- [x] **AC-1** Screens exist and route correctly — Covered by `frontend/src/App.tsx:44-50` (`/me`,
  `/me/measurements`, `/me/measurements/new`, `/me/measurements/:id`, `/me/measurements/:id/edit`,
  `/me/progress`, `/me/goals`, all wrapped in the trainee guard `App.tsx:27-33`) + the page files
  `frontend/src/pages/{TraineeHome,MeasurementsList,MeasurementForm,MeasurementDetail,Progress,Goals}.tsx`.
  `/me/chat` intentionally absent (P8).
- [x] **AC-2** Phone-optimized capture with camera — Covered by `frontend/src/pages/MeasurementForm.tsx`:
  numeric `Input numeric` (`:200`, `inputMode="decimal"` + JetBrains Mono via `components/Input.tsx:13,20`),
  camera photo `<input type="file" accept="image/*" capture="environment">` (`MeasurementForm.tsx:211-216`),
  primary CTA in the bottom action bar (`AppShell` `actionBar` slot, `MeasurementForm.tsx:120,133`).
- [x] **AC-3** Fast <30s multipart log — Covered by `frontend/src/pages/MeasurementForm.tsx:79-101`
  (`FormData`, only filled fields + photo) → `createMeasurement` (`lib/measurements.ts:56-58` → `api.upload`
  multipart, `lib/api.ts:88-92`); required input is minimal (`hasAnyValue` = one value or photo,
  `MeasurementForm.tsx:70-73`); `measured_at` defaults to today (`:30,36`). Verified: `POST /measurements`
  201 (in-process APIClient run).
- [x] **AC-4** Goals GET/POST + screen — Covered by `core/models/goal.py` (Goal model),
  `core/api/serializers.py:299-370` (`GoalSerializer`, key-based validation), `core/api/views.py:184-204`
  (`GoalViewSet` list/create, owner forced), `core/api/urls.py:46,64` (`goals` route),
  `frontend/src/pages/Goals.tsx` + `lib/goals.ts`. Verified: create 201 (owner forced), list 200, error keys
  `invalid_metric`/`missing_target`/`invalid_direction`/`target_out_of_range` all returned. PATCH toggle = P7.
- [x] **AC-5** Progress charts from series — Covered by `frontend/src/components/MetricChart.tsx` (Chart.js
  Line; line color read from `--c-*` CSS var `:55`, `--border` gridlines `:56,80,84`, JetBrains Mono tick
  font `:41,81,85`, transparent canvas, `spanGaps`) + `frontend/src/pages/Progress.tsx` (metric selector,
  summary tiles, ≥2-point guard `:76`). Series verified 200 with per-metric arrays + summary.
- [x] **AC-6** Instrument-panel fidelity — values/dates in `font-mono` (e.g. `MeasurementDetail.tsx:96`,
  `MeasurementCard.tsx:42`), headings/hero in `font-display` (`TraineeHome.tsx:106`, `StatTile.tsx:25`),
  entries/goals as `Card`s. **No hardcoded hex** in any P6 file (grep verified — colors via token utilities
  / CSS custom properties, incl. the chart which reads `--c-*` vars).
- [x] **AC-7** i18n — Covered by `frontend/src/i18n/en.json` + `sk.json` (namespaces `nav/metrics/home/
  measurements/capture/detail/progress/goals/errors`; EN↔SK key parity exact — grep verified, 0 missing/
  extra). All P6 components use `t()`; dates/numbers via `formatDate`/`formatNumber` + `lib/format.ts`;
  backend error keys mapped through `t('errors.<key>')` (`MeasurementForm.tsx:154`, `Goals.tsx:79`) with the
  new keys `no_values/out_of_range/invalid_image/photo_too_large/invalid_metric/invalid_direction/
  missing_target/target_out_of_range` present in both catalogs.
- [x] **AC-8** Access API-enforced — Covered by `core/api/permissions.py:105-149` (`GoalAccessPermission`:
  create trainee+self, read via `can_access`), `core/api/views.py:202-204` (`perform_create` forces
  `user=request.user`), `App.tsx:28-32` (`RequireRole` UI guard). Verified: outsider trainer GET trainee
  goals → 403; owning trainer → 200; trainer POST goal → 403; body `user` on create ignored.

---

## 3. Out of scope (deferred — do not build in P6)

- **`/me/chat`** and any messaging (P8). No chat screen, no message polling in P6.
- **Trainer cockpit** and **photo-compare UI** (`/trainer/*`, P7). P6 does not build the compare picker or
  consume `/measurements/photos` for side-by-side (P7 does).
- **Goal PATCH / toggle-complete** (P7 per epic §9 P7). P6 builds the model + GET + POST only; the viewset
  is shaped so P7 adds the PATCH action without reworking the model or permission (§5.2, §11 Q3).
- **Offline capture queue** and **push/reminders** (post-MVP, epic §3 out-of-scope). The capture form
  requires the network; the P5 service worker precaches the shell only.
- **Measurable-goal auto-progress** (goal reads a metric's current value and computes % done) — post-MVP
  (epic §9 P6 "beyond basic add"). P6 goals are declarative: metric + target + direction + date + note.
- **Body-fat derivation** and any new derived metric — P4 shipped BMI/deltas/trend; P6 only renders them.
- **Pagination / query-optimization NFRs** — epic §9 P8. P6 consumes plain arrays.
- **Imperial unit UX** — the app is metric-only in practice (dev decision); the form defaults `unit_system`
  to `metric` and does not build an imperial toggle (the field is still sent for API compatibility).

---

## 4. Cross-cutting decisions this plan adopts (from epic §3, not re-litigated)

- **React + Tailwind**, tokens the single source, no hardcoded hex (epic Q1, §3).
- **Session auth**, same-origin, CSRF via the P5 handshake; unsafe requests carry `X-CSRFToken` (epic Q2).
- **Numbers are mono** — JetBrains Mono for every value/date; Orbitron headings/hero numbers; Inter elsewhere
  (`design-system.md` §3).
- **i18n from day one** — no hardcoded strings; EN base + complete SK; locale-aware formatting (epic Q6).
- **One authorization predicate** — the new goals endpoints resolve access only through `can_access`; no
  inline role checks in views (epic §3).
- **API-first** — all data via DRF JSON at `/api/v1/`; the SPA holds no business logic (epic §3).
- **Host-agnostic** — API base from `VITE_API_BASE` (default same-origin `/api/v1`) (epic Q5).
- **Layered backend layout** — Goal model under `core/models/`, serializer/view/permission under
  `core/api/`, no business logic in the view (epic §3).

---

## 5. Design / approach

### 5.1 Goal model — `core/models/goal.py` (new)

A declarative, measurable goal owned by a trainee. Mirrors the `Measurement` model's conventions
(`strict` typing via `from __future__ import annotations`, `TextChoices`, validator constants).

```python
class GoalMetric(models.TextChoices):
    WEIGHT = "weight", ...
    CHEST = "chest", ...
    WAIST = "waist", ...
    HIPS = "hips", ...
    BICEPS = "biceps", ...
    THIGH = "thigh", ...
    CALF = "calf", ...
    BODY_FAT_PCT = "body_fat_pct", ...
    # (height and bmi excluded as goal targets — §11 Q6)

class GoalDirection(models.TextChoices):
    DECREASE = "decrease", ...   # e.g. lose waist cm / weight
    INCREASE = "increase", ...   # e.g. gain biceps cm
```

`Goal` fields:

| field | type | notes |
|---|---|---|
| `user` | FK → `AUTH_USER_MODEL`, CASCADE, `related_name="goals"` | owner trainee |
| `metric` | CharField(16, choices=GoalMetric) | which measurement metric |
| `target_value` | DecimalField(6,2), validators Min 0 / Max 1000 | desired value in the metric's unit |
| `direction` | CharField(8, choices=GoalDirection) | increase vs decrease |
| `target_date` | DateField(null=True, blank=True) | optional deadline |
| `is_completed` | BooleanField(default=False) | toggled by P7 (trainer) / owner later |
| `description` | TextField(blank=True, default="") | free note |
| `created_at` | DateTimeField(auto_now_add=True) | immutable |

`Meta.ordering = ["is_completed", "-created_at"]` (open goals first, newest-first). Register in
`core/models/__init__.py` alongside `Measurement`/`CustomUser` (mirror the existing export pattern). Add a
migration via `python manage.py makemigrations core` (no hand-written SQL). Optionally register in
`core/admin.py` if a ModelAdmin registry exists there (mirror `Measurement`'s registration).

### 5.2 Goal API — serializer, viewset, permission, urls (all edits to existing `core/api/*`)

- **`GoalSerializer`** (`core/api/serializers.py`, new class): `Meta.fields = [id, user, metric,
  target_value, direction, target_date, is_completed, description, created_at]`; `read_only_fields =
  [user, is_completed, created_at]` (create cannot self-complete; toggle is P7 via PATCH). `validate()`
  enforces `target_value` within a sane band and returns **i18n error keys** on failure, matching the
  measurement serializer's convention: `invalid_metric`, `invalid_direction`, `target_out_of_range`,
  `missing_target`. `metric`/`direction` invalid choices already yield DRF field errors — normalize their
  `detail` to those keys so the frontend localizes them.
- **`GoalAccessPermission`** (`core/api/permissions.py`, new class, shaped like
  `MeasurementAccessPermission`): create → trainee only + target is self; list → `can_access(target)`;
  object SAFE → `can_access(obj.user)`; PATCH (P7) → owner trainee **or** trainer who owns the trainee
  (toggle-complete). P6 only wires list+create actions, but the permission already admits the P7 PATCH so
  P7 is route-only.
- **`GoalViewSet`** (`core/api/views.py`, new): `serializer_class = GoalSerializer`,
  `permission_classes = [IsAuthenticated, GoalAccessPermission]`, `parser_classes = [JSONParser]`.
  `get_target_user(request)` reuses the same `?user=` resolution as `MeasurementViewSet` (extract the shared
  helper into a small mixin or a module function so it is not copy-pasted — epic §3 "zero duplicated
  logic"). `get_queryset` → `Goal.objects.filter(user=target)`. `perform_create` forces `user=request.user`
  (body `user` ignored, exactly like measurements).
- **URLs** (`core/api/urls.py`, edit): add
  ```python
  _goal_list = GoalViewSet.as_view({"get": "list", "post": "create"})
  # P7 adds: _goal_detail = GoalViewSet.as_view({"patch": "partial_update"})
  path("goals", _goal_list, name="goal-list"),
  ```
  (The `goals/<int:pk>` PATCH route is P7; note it in a comment so P7 has the seam.)

### 5.3 Frontend route table — `frontend/src/App.tsx` (edit)

Replace the single `/me` placeholder with the trainee subtree, all under the existing
`RequireAuth > RequireRole role="trainee"` guard:

| Path | Element |
|------|---------|
| `/me` | `TraineeHome` |
| `/me/measurements` | `MeasurementsList` |
| `/me/measurements/new` | `MeasurementForm` (create mode) |
| `/me/measurements/:id` | `MeasurementDetail` |
| `/me/measurements/:id/edit` | `MeasurementForm` (edit mode) — §11 Q4 |
| `/me/progress` | `Progress` |
| `/me/goals` | `Goals` |

`TraineeHomePlaceholder.tsx` is deleted (replaced by `TraineeHome.tsx`). `TrainerHomePlaceholder.tsx` stays
(P7's job). Navigation between trainee screens uses `react-router` `Link`/`useNavigate`; the `AppShell`
gets a small trainee nav (links to Home / Measurements / Progress / Goals) — added as a shared sub-nav
component so P7 can add its own, without P6 touching trainer chrome.

### 5.4 Frontend resource modules — `frontend/src/lib/measurements.ts`, `goals.ts` (new)

Typed wrappers over `api`, so screens never inline fetch logic:

- `measurements.ts`:
  - `type Measurement` (all serializer fields, decimals as `number | null`, `bmi: number | null`).
  - `type Series = { user:number|null; unit_system:string|null; dates:string[];
    metrics:Record<MetricKey, number[]>; summary:Record<MetricKey, {latest:number|null; delta:number|null;
    trend:'up'|'down'|'flat'|null}> }`.
  - `listMeasurements(userId?)`, `getMeasurement(id)`, `createMeasurement(form: FormData)` (multipart via
    the new upload helper), `updateMeasurement(id, patch)`, `deleteMeasurement(id)`, `getSeries(userId?)`.
- `goals.ts`: `type Goal`, `listGoals(userId?)`, `createGoal(payload)`.
- `metricMeta.ts` (new): the canonical metric list — `MetricKey` union, per-metric i18n label key, unit
  suffix (`kg`/`cm`/`%`), and the CSS-var name for its chart color (`--c-weight`, …). One source the
  form, list, charts, and goals all read, so metric naming never drifts.

### 5.5 Screens

**`TraineeHome` (`/me`)** — `pages/TraineeHome.tsx`. Fetches `getSeries()`. Renders a hero `StatTile` for
the primary metric (weight if present, else the first available), using `summary.weight.latest` as value,
`summary.<m>.delta` + `trend` for the tile delta (arrow color from `StatTile`'s trend prop). A row of
secondary `StatTile`s for a few key metrics (waist, chest). A "log this week" CTA (`Button primary`, in the
`AppShell` action bar) linking to `/me/measurements/new`; if the latest `measured_at` is > 7 days ago (or no
data), show an "overdue" `Pill variant="warn"` nudge (§11 Q7). Empty state (no measurements) shows a
first-run prompt to log the first entry. All numbers via `formatNumber` + `font-mono`; dates via
`formatDate`.

**`MeasurementsList` (`/me/measurements`)** — `pages/MeasurementsList.tsx`. Fetches `listMeasurements()`
(newest-first from the API). Each entry is a `MeasurementCard` (new component): `measured_at` (mono),
weight + a couple of values, a thumbnail (`thumbnail_url`) if present, linking to the detail route. Empty
state → prompt to log. Action bar CTA → `/me/measurements/new`.

**`MeasurementForm` (`/me/measurements/new` and `/:id/edit`)** — `pages/MeasurementForm.tsx`. The core
capture form (AC-2/AC-3):
- Numeric `Input numeric` fields for each value metric (`weight, height, chest, waist, hips, biceps, thigh,
  calf, body_fat_pct`), labeled via `metricMeta` i18n keys with unit suffixes; `measured_at` date input
  (defaults to today). `unit_system` hidden/fixed to `metric` (§3).
- Photo field: `<input type="file" accept="image/*" capture="environment">` (device camera on mobile,
  §11 Q5) with a small preview; optional.
- Builds a `FormData` (only filled fields + photo) and calls `createMeasurement` (or `updateMeasurement` in
  edit mode). On success → navigate to `/me/measurements` (or the detail). On error, map `err.key` through
  `t('errors.<key>')` (`no_values`, `out_of_range`, `invalid_image`, `photo_too_large`).
- Layout: single-column, thumb-reachable; the **primary submit lives in the `AppShell` action bar**
  (`design-system.md` §6). Minimal required input (one value or a photo) so a weekly log is < 30s.
- Edit mode pre-fills from `getMeasurement(id)`; PATCH sends only changed fields. (Edit gated on §11 Q4;
  if declined, drop the `/edit` route and edit-mode branch, keep create-only.)

**`MeasurementDetail` (`/me/measurements/:id`)** — `pages/MeasurementDetail.tsx`. Fetches `getMeasurement`.
Shows every value in a mono readout table (Inter headers, JetBrains Mono values, `design-system.md` §5),
the computed `bmi`, `measured_at`/`created_at`, and the full-resolution photo (`photo_url`, direct Blob
URL, no proxy). Owner actions: **Delete** (`deleteMeasurement`, confirm first, then back to the list — the
backend signal cleans the blob) and an **Edit** link (§11 Q4). On 404/403 → localized not-found/redirect.

**`Progress` (`/me/progress`)** — `pages/Progress.tsx`. Fetches `getSeries()`. A metric selector
(pills/tabs over the metrics present in the series). For the selected metric, a `MetricChart` (new
component wrapping Chart.js, §5.6) plots `dates` × `metrics[metric]`, line colored from that metric's
`--c-*` token, gridlines at low-opacity `--border`, tick labels in JetBrains Mono, transparent background,
nulls gapped. A summary strip reuses `StatTile` (latest, delta, trend) per the series `summary`. Empty
state when < 2 points ("need more entries to chart a trend"). All labels via i18n; axis dates via locale
formatting.

**`Goals` (`/me/goals`)** — `pages/Goals.tsx`. Fetches `listGoals()`. Lists `GoalCard`s (new component):
metric label + target (`formatNumber` + unit, mono), direction arrow, optional `target_date`
(`formatDate`), a `Pill` for status (`ok` = completed, `accent` = active), and the note. An **Add goal**
form (in a `Card` or a bottom sheet): metric select (from `metricMeta`), `target_value` (`Input numeric`),
direction select, optional `target_date`, optional description → `createGoal` → refresh list. Map goal
error keys (`invalid_metric`, `invalid_direction`, `target_out_of_range`, `missing_target`) via i18n. No
complete-toggle in P6 (P7). Empty state → prompt to add the first goal.

### 5.6 Charts — Chart.js (`frontend/package.json` edit, `components/MetricChart.tsx` new)

Add `chart.js` and `react-chartjs-2` to `frontend/package.json` (design-system §5 names Chart.js
explicitly; §11 Q1). `MetricChart` registers only the pieces it needs (`LineController`,
`LineElement`, `PointElement`, `LinearScale`, `CategoryScale`, `Tooltip`) to keep the bundle lean, reads
brand colors from CSS custom properties at render time via
`getComputedStyle(document.documentElement).getPropertyValue('--c-<metric>')` (so charts re-color correctly
with the theme and stay token-sourced — no hex in the component, AC-6), sets a JetBrains Mono font on tick
labels, transparent canvas, and `--border` gridlines. Props:
`{ labels: string[]; data: (number|null)[]; colorVar: string; label: string }`.

### 5.7 API client extension — `frontend/src/lib/api.ts` (edit)

Add three helpers to the exported `api` object, reusing the existing `request` CSRF/credentials handling:

- `api.patch<T>(path, body)` — JSON PATCH (unsafe → CSRF header attached like `post`).
- `api.del<T>(path)` — DELETE (unsafe → CSRF; 204 → `undefined`).
- `api.upload<T>(path, form: FormData)` — POST multipart: **must not set `Content-Type`** (let the browser
  set the boundary), still `credentials:'include'` + `ensureCsrf()` + `X-CSRFToken`. Errors surface the same
  `ApiError` with `.key` for i18n.

These extend the P5 client without changing its existing `get`/`post` behavior.

### 5.8 i18n keys — `frontend/src/i18n/en.json` + `sk.json` (edit)

Add namespaced keys for every new string (both catalogs, complete parallel — AC-7). Namespaces:
`nav.*` (home/measurements/progress/goals), `home.*` (hero labels, "log this week", overdue, empty),
`measurements.*` (list, empty, card labels), `capture.*` (field labels per metric, unit suffixes, photo,
submit, save), `detail.*` (labels, delete/confirm, edit), `progress.*` (metric names, empty, axis),
`goals.*` (list, add form labels, direction/metric option labels, status), and `errors.*` additions
(`no_values`, `out_of_range`, `invalid_image`, `photo_too_large`, `invalid_metric`, `invalid_direction`,
`target_out_of_range`, `missing_target`). Metric display names live under a shared `metrics.*` namespace so
form, list, chart, and goals all reference the same key. SK is developer-drafted (flag for native review,
consistent with P5).

---

## 6. File Plan

Backend is Python (strict types via `from __future__ import annotations`, full hints, PSR-equivalent PEP 8;
no raw SQL — Doctrine-equivalent here is the Django ORM only). Frontend is TypeScript/TSX (strict), no
hardcoded hex, no user-facing string literal outside the i18n catalogs.

| File | Change | Notes |
|------|--------|-------|
| `core/models/goal.py` | new | `Goal` + `GoalMetric` + `GoalDirection` (§5.1) |
| `core/models/__init__.py` | edit | export `Goal` (mirror existing exports) |
| `core/api/serializers.py` | edit | add `GoalSerializer` with key-based validation (§5.2) |
| `core/api/permissions.py` | edit | add `GoalAccessPermission` (§5.2) |
| `core/api/views.py` | edit | add `GoalViewSet`; extract shared `?user=` resolver to avoid duplication (§5.2) |
| `core/api/urls.py` | edit | add `goals` list/create route; comment the P7 PATCH seam (§5.2) |
| `core/migrations/000X_goal.py` | new (generated) | `makemigrations core`; no hand SQL |
| `core/admin.py` | edit (if registry exists) | register `Goal` mirroring `Measurement` |
| `frontend/package.json` | edit | add `chart.js`, `react-chartjs-2` |
| `frontend/src/lib/api.ts` | edit | add `patch`, `del`, `upload` helpers (§5.7) |
| `frontend/src/lib/measurements.ts` | new | types + fetch fns (§5.4) |
| `frontend/src/lib/goals.ts` | new | types + list/create (§5.4) |
| `frontend/src/lib/metricMeta.ts` | new | metric union + label keys + units + chart color vars (§5.4) |
| `frontend/src/App.tsx` | edit | trainee route subtree (§5.3) |
| `frontend/src/components/TraineeNav.tsx` | new | shared trainee sub-nav (§5.3) |
| `frontend/src/components/MeasurementCard.tsx` | new | list item card (§5.5) |
| `frontend/src/components/MetricChart.tsx` | new | Chart.js line wrapper, token colors (§5.6) |
| `frontend/src/components/GoalCard.tsx` | new | goal list item (§5.5) |
| `frontend/src/pages/TraineeHome.tsx` | new | `/me` home (§5.5) |
| `frontend/src/pages/MeasurementsList.tsx` | new | `/me/measurements` (§5.5) |
| `frontend/src/pages/MeasurementForm.tsx` | new | capture form, create + edit (§5.5) |
| `frontend/src/pages/MeasurementDetail.tsx` | new | `/me/measurements/:id` (§5.5) |
| `frontend/src/pages/Progress.tsx` | new | `/me/progress` charts (§5.5) |
| `frontend/src/pages/Goals.tsx` | new | `/me/goals` list + add (§5.5) |
| `frontend/src/pages/TraineeHomePlaceholder.tsx` | delete | replaced by `TraineeHome.tsx` |
| `frontend/src/i18n/en.json` | edit | add P6 keys (§5.8) |
| `frontend/src/i18n/sk.json` | edit | add P6 keys, complete parallel (§5.8) |

No `CLAUDE.md` created (deferred to P8 per P1). No test files (epic §3).

---

## 7. Manual verification (no automated tests — epic §3)

Run the Django backend (`python manage.py migrate && python manage.py runserver`) and the Vite dev server
(`cd frontend && npm install && npm run dev`, proxy to `:8000`). Use a **trainee** account (register one via
`/register` if needed). Each step maps to an AC.

1. **Migration + goals API (AC-4, AC-8).** `makemigrations`/`migrate` apply cleanly. As a trainee:
   `POST /api/v1/goals` with a valid body → 201, `user` is self (not any body-supplied id); `GET
   /api/v1/goals` → the created goal. `POST` with a bad metric → 400 `{"detail"/"metric":"invalid_metric"}`;
   out-of-range target → `target_out_of_range`. As **another trainer/trainee**, `GET
   /api/v1/goals?user=<the trainee>` → 403 (not owned) — confirms `can_access` gates goals.
2. **Home (AC-1, AC-6).** `/me` shows the latest measurement as an Orbitron hero number with a mono delta +
   trend arrow (color per direction), secondary stat tiles, and a "log this week" CTA in the bottom action
   bar. With no measurement in >7 days, the overdue pill shows; with data logged today, it does not. Empty
   account shows the first-run prompt. All numbers mono, dates locale-formatted.
3. **Capture form (AC-2, AC-3).** `/me/measurements/new`: numeric fields are JetBrains Mono with a decimal
   keypad on mobile; the photo field opens the camera on a phone. Fill one value + snap a photo, submit →
   multipart POST succeeds, lands back on the list with the new entry (thumbnail visible). Time the flow on a
   phone viewport — under 30s. Submitting nothing → localized `no_values`; a 5000 kg weight → localized
   `out_of_range`; an over-size/invalid image → `photo_too_large`/`invalid_image`.
4. **List + detail (AC-1, AC-6).** `/me/measurements` lists entries newest-first as cards with mono values.
   Open one → detail shows all values, BMI, the full photo (direct Blob URL), and dates. Delete (with
   confirm) removes it and returns to the list; verify in `/admin/` the row is gone (blob cleanup is the P3
   signal). Edit (if §11 Q4 accepted): change a value → PATCH persists; a trainer cannot reach the edit/
   delete (API returns 403 on PATCH/DELETE of a trainee's row).
5. **Progress charts (AC-5, AC-6).** With ≥2 entries, `/me/progress` charts the selected metric: line in the
   metric's brand color, mono tick labels, faint gridlines, transparent bg; switching metric re-renders;
   toggling the theme re-colors correctly (colors read from CSS vars). < 2 points → the "need more entries"
   state. Summary tiles match the series `summary` (latest/delta/trend).
6. **Goals screen (AC-4, AC-7).** `/me/goals` lists goals with metric label, target (mono + unit),
   direction arrow, optional date, and a status pill. Add a goal via the form → appears in the list.
   Validation errors localize. No complete-toggle present (P7).
7. **i18n (AC-7).** Switch EN→SK in the shell: **every** P6 string changes — nav, home, capture labels,
   metric names, detail, progress, goals, and the mapped backend error messages. Reload → language persists.
   Grep the P6 `.tsx`/`.ts` for user-facing string literals → none (all via `t()`); grep for hex literals →
   none (AC-6).
8. **Access boundary (AC-8).** As the trainee, the capture POST never includes another `user`; manually
   navigating to `/trainer` is redirected by `RequireRole`; hitting `/api/v1/measurements?user=<other>` or
   `/api/v1/goals?user=<other>` returns 403.

---

## 8. Risks / notes

- **Goal is net-new backend, mid-epic.** It must not drift from the measurement conventions (key-based
  errors, `user`-forced create, `can_access` gating, `?user=` resolver). Reuse the shared resolver rather
  than copy-pasting (epic §3 "zero duplicated logic"). The permission is built full now so P7's PATCH is
  route-only.
- **Multipart CSRF.** The upload helper must omit `Content-Type` (browser sets the multipart boundary) yet
  still attach `X-CSRFToken` — the one place easy to get wrong. Covered in §5.7 and verified in step 3.
- **Chart colors from CSS vars.** Chart.js can't read Tailwind utilities; `MetricChart` pulls `--c-*` via
  `getComputedStyle` so it stays token-sourced and theme-correct — re-read on theme change (or key the chart
  off the theme) so a light↔dark toggle recolors.
- **Metric naming single source.** `metricMeta.ts` + the `metrics.*` i18n namespace are the one place metric
  labels/units live; the form, list, chart, and goals all read them so a rename is one edit.
- **Chart.js enters the bundle.** New runtime dep (~consider tree-shaken registration). Gitignored
  `node_modules`; `npm install` documented. First runtime dep added since P5.
- **"Under 30s" is a UX target, not a gate.** Keep required input minimal (one value or a photo), defaults
  sensible (`measured_at`=today, `unit_system`=metric), and the CTA thumb-reachable.
- **SK completeness** is an AC; developer-drafted SK is acceptable for MVP but flag for native review
  (consistent with P5).

---

## 11. Open questions (proposals — confirm before implementing)

- **Q1 — Chart library = Chart.js + react-chartjs-2.** `design-system.md` §5 names Chart.js; nothing is
  installed yet. **Proposal:** add `chart.js` + `react-chartjs-2`, register only the needed controllers.
  *(Default: Chart.js + react-chartjs-2.)*
- **Q2 — Data fetching stays raw `api` + local hooks (no TanStack Query).** P5 Q4 deferred the decision to
  P6. **Proposal:** ship small per-screen fetch hooks over the `api` client + `useState/useEffect`; the data
  volume is low and it avoids a new dep. *(Default: raw client, no TanStack Query.)*
- **Q3 — Goal PATCH/toggle-complete: P6 or P7?** Epic §9 assigns GET+POST to P6 and toggle-complete to P7.
  **Proposal:** P6 builds the model + GET + POST only; the `GoalAccessPermission` already admits the trainer/
  owner PATCH so P7 adds just the route + action. *(Default: model + GET + POST in P6; PATCH in P7.)*
- **Q4 — Measurement edit UI in P6?** The API supports owner PATCH; `mvp-routes.md` lists "edit own recent
  entry." **Proposal:** include an edit route reusing `MeasurementForm` in edit mode (PATCH changed fields),
  since the form already exists. If you'd rather keep P6 to create + delete only, I'll drop the `/edit` route
  and edit branch. *(Default: include edit.)*
- **Q5 — Photo capture uses `<input type="file" accept="image/*" capture="environment">`.** Native, no
  camera library, works as a file picker on desktop and the rear camera on mobile. *(Default: native
  capture input.)*
- **Q6 — Goal metric set.** **Proposal:** allow goals on the value metrics `weight, chest, waist, hips,
  biceps, thigh, calf, body_fat_pct`; **exclude** `height` (not a training target) and `bmi` (derived, not
  directly settable). *(Default: value metrics minus height/bmi.)*
- **Q7 — "Overdue / log this week" threshold.** **Proposal:** client-side — flag overdue when the latest
  `measured_at` is more than **7 days** ago (or there is no measurement). No backend field. *(Default: 7-day
  client-side threshold.)*
- **Q8 — Branch.** P5 was implemented on `main` at your request. **Proposal:** implement P6 on `main` too
  (consistent), unless you want a `feature-P6` branch. *(Default: `main`.)*

---

## 13. Post-Implementation

**Built (all §11 defaults Q1–Q8 taken), on `main`.** Backend: the new `Goal` stack — `core/models/goal.py`
(`Goal` + `GoalMetric` + `GoalDirection`, migration `0004_goal`), `GoalSerializer` (key-based validation),
`GoalAccessPermission` (create trainee+self; read via `can_access`; the P7 toggle-complete PATCH already
admitted), `GoalViewSet` (list/create, owner forced), `goals` route, and admin registration. The `?user=`
resolver was extracted into a shared `TargetUserMixin` (`core/api/views.py`) consumed by both the
measurement and goal viewsets (no copy-paste). Frontend: six trainee screens (`TraineeHome`,
`MeasurementsList`, `MeasurementForm` create+edit, `MeasurementDetail`, `Progress`, `Goals`) inside the P5
shell, with `TraineeNav`, `MeasurementCard`, `MetricChart` (Chart.js), and `GoalCard` components; typed
resource modules (`lib/measurements.ts`, `lib/goals.ts`, `lib/metricMeta.ts`, `lib/format.ts`); the API
client gained `patch`/`del`/multipart-`upload` helpers; the route table replaced the `/me` placeholder;
EN/SK catalogs extended (exact key parity). Chart.js + react-chartjs-2 added to `frontend/package.json`.

**Verification.** `npm run build` clean (tsc strict + vite + PWA `sw.js`/manifest). Django `check` clean;
migration applied. Backend contract exercised in-process via DRF `APIClient`: goal create 201 (owner forced,
`is_completed=False`), list 200, and the four validation keys (`invalid_metric`, `missing_target`,
`invalid_direction`, `target_out_of_range`); access boundary — outsider trainer→403, owning trainer→200,
trainer-create→403, body `user` ignored; measurement create/list/series regression-clean after the mixin
refactor. No browser-driven manual pass was run (no automated tests per epic §3); the developer should
exercise the UI flows in §7.

**Deviation the developer must know about:**
- **The list API is paginated** (`progresso/settings/base.py:95` `PageNumberPagination`, `PAGE_SIZE=50`) —
  `GET /measurements` and `GET /goals` return the `{count, next, previous, results}` envelope, **not** a
  plain array as the plan's §0 assumed (that came from an incorrect codebase survey). Series, retrieve, and
  create are unaffected (plain objects). Fixed inline: `listMeasurements`/`listGoals` unwrap `.results`
  (`lib/measurements.ts:60-75`, `lib/goals.ts:35-39`) and a `Paginated<T>` type was added. **MVP reads the
  first page only** — a trainee with >50 entries/goals won't see the rest until `next`-following is added
  (a P8 pagination-NFR concern, epic §9 P8). Flagged, not silently truncated.

**Follow-ups / notes:**
- **Measurement edit (Q4)** supports replacing the photo via multipart `PATCH` (`api.upload(..., 'PATCH')`);
  edit sends all currently-filled value fields, not a minimal diff — acceptable for MVP.
- **`hips` chart color** reuses `--c-biceps` and `body_fat_pct` reuses `--c-waist` (the token set defines six
  `--c-*` vars; these two metrics have no dedicated token). Cosmetic; add tokens if a distinct hue is wanted.
- **SK catalog** is developer-drafted; flag for native review (consistent with P5, epic Q6).
- A `frontend/tsconfig.tsbuildinfo` churn shows in `git status` (tracked build artifact from P5) — harmless.
- Dev test users (`p6_tr`, `p6_other_tr`, `p6_t2`) + sample rows were created in the dev SQLite DB during
  verification; delete via `/admin/` if desired.
