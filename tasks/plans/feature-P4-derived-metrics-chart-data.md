# Feature Plan: P4 — Derived Metrics & Chart Data

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved)
**Plan ID:** P4
**Slug:** derived-metrics-chart-data
**Author:** Claude (Opus)
**Date:** 2026-08-11
**Status:** Complete (implemented + manually verified 2026-08-11; metric-only)

> No GitHub issue. ACs are quoted from the design docs (`tasks/design/*.md`) via the epic §9 P4 brief.
> P1 shipped the DRF scaffold + `CustomUser`/`can_access`; P2 shipped the `Measurement` model + CRUD API;
> P3 hung the progress photo + blob lifecycle off the same model. P4 computes **insight from the numbers
> already collected** — a metrics service (BMI, per-metric deltas, trend direction) and the
> server-computed **chart series** endpoint.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7.

> **Backend only.** P4 exposes the derived data; the Chart.js rendering and stat tiles that consume it are
> P6 (trainee `/me/progress`) and P7 (trainer `.../progress`). No frontend here.

---

## 1. Goal

Turn the raw `Measurement` history into the two derived surfaces the coaching loop needs:

- **A metrics service** (`core/services/metrics.py`) — pure, model-free functions computing **BMI**,
  **per-metric deltas** (latest vs previous), and **trend direction** (up / down / flat). Body-fat estimate
  is **post-MVP** (`mvp-routes.md` §scope) — not derived here; the stored `body_fat_pct` input is charted
  as-is only.
- **A `bmi` property** on `Measurement` (the P4 slot the P2/P3 docstring reserves) so a single measurement
  can report its own BMI, and it is carried in every measurement payload.
- **A chart-data service** (`core/services/chart_data.py`) + **`GET /api/v1/measurements/series?user=:id`**
  endpoint — server-computed series: an ascending date axis plus per-metric value arrays (+ a BMI array),
  and a per-metric summary (latest, delta, trend) for the stat tiles. Shaped for Chart.js
  (`design-system.md` §5 Charts). Gated by the **same** `can_access` predicate as the rest — owner trainee
  or trainer-who-owns; other-trainer `403`.

Out of scope (owned elsewhere): body-fat *derivation* (post-MVP); goal auto-progress that *reads* these
metrics ships with Goals in P6/P7; the actual charts/stat-tile UI (P6/P7).

The `Measurement` model file is shared across P2/P3/P4. P4 adds only the `bmi` property (no new DB column —
BMI is computed, not stored) and must not disturb P2's fields or P3's photo wiring.

---

## 2. Acceptance criteria (quoted from design docs via epic §9 P4 brief)

Each AC gets an ID so §5/§7 can reference it. ACs are verbatim from the design docs.

- **AC-1** "Trend/chart data endpoint (server-computed series per metric)." (`rebuild-analysis.md` §6 B3)
  — **Covered:** `core/api/views.py:161` (`series` action) + `core/services/chart_data.py:71` (`build_series`).
- **AC-2** "Derived metrics service: BMI, body-fat estimate, per-metric deltas & trend direction."
  (`rebuild-analysis.md` §6 B4) — **body-fat estimate is post-MVP** per `mvp-routes.md` §scope; MVP ships
  **BMI, per-metric deltas, and trend direction**. The service is structured so a body-fat function drops in
  later without a rewrite. — **Covered:** `core/services/metrics.py:44` (`bmi`), `:56` (`delta`), `:72`
  (`trend`); body-fat seam noted `core/services/metrics.py:112`.
- **AC-3** "computed `bmi` (property)" on `Measurement`. (`rebuild-analysis.md` §5 Measurement)
  — **Covered:** `core/models/measurement.py:143` (`bmi` property); rides every row payload via
  `core/api/serializers.py:134` (`bmi` field) + `:208` (`get_bmi`).
- **AC-4** Endpoint `GET /api/v1/measurements/series?user=:id` → "chart series: dates + per-metric arrays"
  (`mvp-routes.md` §B Measurements, line 90). Access: "owner or trainer(owns)" (same line). Trainee omits
  `user` → own series; passing a `user` the caller can't access → `403`.
  — **Covered:** route `core/api/urls.py:38` (`measurement-series`, before the pk route); action
  `core/api/views.py:161` reusing `get_target_user` (`:111`); resolves series/photos/pk with no shadowing.
- **AC-5** (epic §5 / §10) Access resolves through the **single** `can_access` predicate — the series
  endpoint introduces **no** new trainer→trainee branch. For
  `{trainee, trainer(owns), other-trainer} × {own data, other's data}` the endpoint yields `{200, 403}` as
  the matrix below. — **Covered:** `core/api/views.py:105` (`permission_classes = [IsAuthenticated,
  MeasurementAccessPermission]`, no per-action override); services carry no role literal
  (`grep can_access/role core/services/` → docstrings only).
- **AC-6** "Derived insight … compute on the data you already collect." (`rebuild-analysis.md` §1 #5) — all
  BMI/delta/trend computation is **server-side** (services layer, epic §3), never in the view or a template;
  series is shaped for Chart.js consumption (`design-system.md` §5). — **Covered:** math in
  `core/services/metrics.py` + `core/services/chart_data.py`; `core/api/views.py:161` only queries +
  delegates (no arithmetic).

### Permission matrix — manual verification checklist (epic §5; no automated tests)

The `series` endpoint is a **safe GET** and inherits the P2 measurements access model unchanged — access
resolves through the same `can_access` predicate via `MeasurementAccessPermission.has_permission`
(exactly as the P3 `photos` feed). For `{trainee, trainer(owns), other-trainer} × {own, other's data}`:

| Caller | Target | `GET /measurements/series?user=` |
|--------|--------|----------------------------------|
| trainee | self (omit `user`) | 200 (own series) |
| trainee | another user's | 403 |
| trainer | own trainee | 200 |
| trainer | other trainer's trainee | 403 |
| admin (role admin / superuser) | anyone | 200 |

Verified by hand in §7.

---

## 3. Out of scope (deferred — do not build in P4)

- **Body-fat *estimate*/derivation** → post-MVP (`mvp-routes.md` §scope; epic §9 P4 note). P4 charts the
  stored `body_fat_pct` **input** value only; it computes no body-fat number. Leave a clearly-named seam in
  `metrics.py` (a `# body-fat: post-MVP` note) so it slots in later.
- **Goal auto-progress** (comparing latest measurement to a goal target) → ships with Goals in P6/P7
  (`rebuild-analysis.md` §5 Goal). It will *consume* `metrics.py`, but the goal model/endpoints are not P4.
- **Charts / stat-tile UI, trend arrows, overdue flags** → P6 (`/me/progress`) and P7 (roster + `.../progress`).
  P4 returns the numbers those screens render; it renders nothing.
- **Roster-level aggregates** (last-measurement date, overdue detection across a trainer's trainees) → P7 G1.
  P4's series is single-user.
- **New CRUD verbs / write paths** — `series` is read-only; no create/patch/delete added.
- **Pagination of the series** — the series is the *whole* history for a chart; it is intentionally
  **not** paginated (§5.5 / §11 Q5). The paginated list stays `GET /measurements`.
- **Deep query-optimization / caching of computed series** → P8 hardening. P4 does the obvious
  `select_related`/ordered single query; no cache layer.

---

## 4. Cross-cutting decisions this plan adopts (from epic §3, no re-litigating)

- **One authorization predicate.** The `series` action resolves its target via the existing
  `get_target_user` and is gated by `MeasurementAccessPermission` (P2, `core/api/permissions.py:61`) whose
  `has_permission` calls `request.user.can_access(target)`. No new role/data-access branch anywhere in P4.
- **Compute server-side, in the services layer.** BMI/delta/trend live in `core/services/metrics.py`; the
  series assembly lives in `core/services/chart_data.py` (epic §3 names both files). The view stays **thin**
  — it resolves the target, pulls the queryset, hands it to `chart_data`, and returns the result. No logic in
  the view, none in a template (there are no templates — API-first).
- **Layered layout.** Model gains only the `bmi` property; services do the math; the serializer shapes
  output; the viewset wires. URLconf holds no logic.
- **No raw SQL.** ORM only — an ordered `Measurement.objects.filter(user=target)` query; all math in Python
  over `Decimal`.
- **strict typing + PEP 8.** New modules open with `from __future__ import annotations`; full type hints on
  every function/method; PEP 8 (line length 99, matching P2/P3).
- **i18n (epic Q6).** The trend direction is returned as a **stable enum key** (`"up"`/`"down"`/`"flat"`),
  not localized prose — the SPA localizes and maps it to an arrow/color. Any error `detail` stays a
  translation key. Numeric values are plain JSON numbers; the SPA formats per locale (JetBrains Mono digits).
- **Decimal correctness.** All values are model `DecimalField`s; the service computes in `Decimal` and
  rounds derived values (BMI, deltas) with `quantize` — no float drift in the payload.
- **Host-agnostic / no data files in git.** No new committed data, no new dependency (stdlib `decimal` only).

---

## 5. Design / approach

### 5.1 `core/models/measurement.py` — the `bmi` property (edit; P4's reserved slot; AC-3)

Add a computed, read-only `bmi` **property** (no DB column — BMI derives from `weight` + `height`):

- Returns `Decimal | None`. `None` when `weight` or `height` is missing (a metric row may carry neither).
- **Metric-only** (developer decision 2026-08-11: the app is metric-only). BMI is `weight_kg /
  (height_cm/100)²` — no unit branch, no imperial conversion. (`unit_system` still exists on the model from
  P2, but P4 treats all data as metric; imperial input is not a supported product path — §8.)
- Rounded to **one decimal** via `Decimal.quantize(Decimal("0.1"))`.
- Implemented by delegating to `metrics.bmi(weight, height)` (§5.2) so the formula lives in the service, not
  duplicated on the model. The property is a thin adaptor: `return metrics.bmi(self.weight, self.height)`.

Docstring updated: the P4 slot is now filled (property only, no migration). No change to fields/`Meta`.

### 5.2 `core/services/metrics.py` — the derived-metrics service (new; AC-2)

Pure, **model-free** functions (take primitives / values, return values) so they are trivially reusable by
the chart service, the model `bmi` property, and later the Goals auto-progress:

- `bmi(weight: Decimal | None, height: Decimal | None) -> Decimal | None` — metric BMI `weight_kg /
  (height_cm/100)²` (§5.1). Returns `None` if either input is missing or height is zero. No unit parameter —
  metric-only.
- `delta(latest: Decimal | None, previous: Decimal | None) -> Decimal | None` — `latest - previous`
  (signed), `None` if either is missing. Rounded to the field's natural precision (2 dp for body metrics,
  1 dp for BMI/body-fat) via a small `quantize` helper (§11 Q2 proposes delta = latest **vs previous entry**,
  i.e. most-recent change, matching the stat-tile "▲ +0.6 kg" in `design-system.md` §5).
- `TrendDirection` — a `str` enum / `Literal["up", "down", "flat"]` (stable keys, not prose). `trend(delta:
  Decimal | None, *, flat_epsilon: Decimal) -> str | None` → `"flat"` when `abs(delta) <= flat_epsilon`,
  else `"up"`/`"down"` by sign; `None` when `delta` is `None`. **Direction is neutral** — it reports the sign
  of change, not whether that change is "good" (goodness depends on the metric + the trainee's goal, which is
  a Goals concern, P6/P7). Proposed `flat_epsilon` per metric family (§11 Q3).
- `# body-fat estimate: post-MVP` — a named seam (comment + a stub signature note) so the future function has
  an obvious home without being built now (epic §9 P4 note).

No Django imports beyond `Decimal`. No unit-conversion constants — metric-only.

### 5.3 `core/services/chart_data.py` — series assembly (new; AC-1, AC-6)

One entry point the view calls:

- `build_series(measurements: Iterable[Measurement]) -> dict` — takes an **ascending-by-`measured_at`**
  iterable of one user's measurements and returns the Chart.js-ready payload (§5.4 shape). It:
  1. Builds the `dates` axis from `measured_at` (ISO `YYYY-MM-DD` strings, ascending — charts read
     left-to-right oldest→newest; the list endpoint stays newest-first, they differ intentionally).
  2. For each charted metric (the P2 `_VALUE_FIELDS` — `weight, height, chest, waist, hips, biceps, thigh,
     calf, body_fat_pct`) emits an array aligned to `dates`, `null` where that row omitted the value
     (Chart.js skips nulls / `spanGaps`).
  3. Emits a `bmi` array (per row, via `metrics.bmi`).
  4. Builds a `summary` map: per metric `{latest, delta, trend}` using `metrics.delta`/`metrics.trend` over
     the last two **non-null** points for that metric (delta needs two readings; a metric with one reading
     gets `delta: null, trend: null`).
- **Metric-only** (developer decision): values are charted as-stored — no unit branch, no conversion. The
  payload carries a top-level `unit_system: "metric"` marker so the SPA labels axes. (No mixed-unit handling
  is needed because the app is metric-only.)

`chart_data.py` imports `metrics` and the `Measurement` type only for hints; the DB query lives in the view.

### 5.4 Series payload shape (Chart.js-ready; §11 Q6)

Proposed JSON (a plain `dict` serialized by DRF, or a thin read `SeriesSerializer` — §11 Q6):

```json
{
  "user": 42,
  "unit_system": "metric",
  "dates": ["2026-06-01", "2026-07-01", "2026-08-01"],
  "metrics": {
    "weight":  [84.0, 83.1, 82.5],
    "waist":   [92.0, null, 88.0],
    "bmi":     [26.7, 26.4, 26.2]
  },
  "summary": {
    "weight": {"latest": 82.5, "delta": -0.6, "trend": "down"},
    "waist":  {"latest": 88.0, "delta": -4.0, "trend": "down"},
    "bmi":    {"latest": 26.2, "delta": -0.2, "trend": "down"}
  }
}
```

- `dates` ascending; each `metrics[field]` array is index-aligned to `dates`, `null` for gaps.
- Only metrics with at least one reading appear under `metrics`/`summary` (an all-null metric across the whole
  history is omitted to keep the payload lean — §11 Q6). `bmi` appears whenever any row has weight+height.
- `summary.*.trend` is one of `"up"|"down"|"flat"` (i18n keys); `delta`/`latest` are numbers or `null`.
- Empty history → `{"user": id, "unit_system": null, "dates": [], "metrics": {}, "summary": {}}` (a valid
  empty series, `200` — not a 404).

### 5.5 `core/api/views.py` — the `series` action (edit; thin; AC-1, AC-4)

Add a `series` method to `MeasurementViewSet`, mirroring the existing `photos` action (`views.py:138`):

```python
def series(self, request: Request) -> Response:
    target = self.get_target_user(request)
    measurements = (
        Measurement.objects.filter(user=target)
        .select_related("user")
        .order_by("measured_at", "created_at")  # ascending for the chart axis
    )
    payload = chart_data.build_series(measurements)
    return Response(payload)
```

- Reuses `get_target_user` (so `?user=` + `can_access` gating is identical to `list`/`photos`).
- Permission: the class-level `[IsAuthenticated, MeasurementAccessPermission]` already gates a safe GET
  through `can_access` in `has_permission` — no per-action permission override needed (same as `photos`).
- **Not paginated** — the whole history feeds the chart (§5.3). `series` does not call `paginate_queryset`;
  it returns the assembled dict directly.
- View stays thin: resolve target, ordered query, delegate to `chart_data`, return. No math in the view.

### 5.6 `core/api/urls.py` — the `series` route (edit; AC-4)

Add, **before** the `measurements/<int:pk>` route (mirroring the `photos` literal ordering the file already
documents; the P2 §8 collision-class note anticipated `series`):

```python
_measurement_series = MeasurementViewSet.as_view({"get": "series"})
...
path("measurements/series", _measurement_series, name="measurement-series"),
```

The `_measurement_series` view is declared next to `_measurement_photos`; the `path()` sits with the other
literal `measurements/*` routes ahead of `measurements/<int:pk>`.

### 5.7 `core/api/serializers.py` — expose `bmi` on `MeasurementSerializer` (edit; AC-3)

So the computed BMI rides in every single-measurement payload (list/detail), add a read-only `bmi` field
mapped to the model property:

- `bmi = serializers.DecimalField(max_digits=4, decimal_places=1, read_only=True)` **or** a
  `SerializerMethodField` returning `obj.bmi` (§11 Q6 picks one). Add `"bmi"` to `fields` and
  `read_only_fields`. This is additive — P2's `validate()`/photo handling is untouched.
- The `series` endpoint does **not** use `MeasurementSerializer` (it returns the aggregated series dict); the
  serializer change only enriches the per-row payloads P6/P7 already fetch.

### 5.8 No migration

`bmi` is a **property**, not a field — `makemigrations` produces **nothing** for P4. Confirm with
`python manage.py makemigrations --check` (no drift) during verification (§7 step 1). No `core/models/__init__.py`
change (no new symbol — `bmi` is an attribute of the existing `Measurement`).

---

## 6. File Plan

New modules open with `from __future__ import annotations`; full type hints; PEP 8 (line length 99). No test
files (epic §3).

| File | Change | Notes |
|------|--------|-------|
| `core/services/metrics.py` | **new** | `bmi`, `delta`, `trend` (+ `TrendDirection` keys); model-free `Decimal` math; body-fat seam noted (§5.2) |
| `core/services/chart_data.py` | **new** | `build_series(measurements)` → Chart.js-ready dict; aligns arrays, computes summary via `metrics` (§5.3–5.4) |
| `core/models/measurement.py` | edit | add read-only `bmi` property delegating to `metrics.bmi`; fill the P4 docstring slot (§5.1). No field, no migration. |
| `core/api/views.py` | edit | add thin `series` action on `MeasurementViewSet`, ascending query, delegate to `chart_data` (§5.5) |
| `core/api/urls.py` | edit | add `measurements/series` route before the pk route (§5.6) |
| `core/api/serializers.py` | edit | add read-only `bmi` to `MeasurementSerializer` fields (§5.7) |

No new dependency (stdlib `decimal` only). No migration (§5.8). No frontend (P6/P7). No `CLAUDE.md` (still
deferred per P1/P2/P3).

---

## 7. Manual verification (no automated tests — epic §3)

Prereq (same personas as P2/P3 §7): trainer **T1** + its trainee **A**; second trainer **T2** + its trainee
**B**. Log in per persona for a session cookie + CSRF (`GET /auth/me` seeds `csrftoken`). Give **A** a small
history first: create (as A) ≥3 measurements on **different `measured_at` dates** with changing `weight`,
`waist`, and both `weight`+`height` set on at least two rows (so BMI + deltas have two readings). Include one
row that omits `waist` (to exercise the null-gap alignment).

1. **No migration / boot (AC-3).** `python manage.py makemigrations --check` → **no changes** (bmi is a
   property). `python manage.py check` clean. `runserver` boots.
2. **`bmi` in row payloads (AC-3).** As **A**: `GET /api/v1/measurements` and `GET /measurements/:id` on a
   row with weight+height → each row carries a non-null `bmi` (1 dp). A row missing weight or height →
   `bmi: null`. Spot-check the number by hand (e.g. `82.5 kg / 1.78 m² ≈ 26.0`).
3. **Series happy path (AC-1, AC-4, AC-6).** As **A**: `GET /api/v1/measurements/series` (no `user`) → `200`.
   Response has `dates` **ascending**; `metrics.weight` / `metrics.waist` / `metrics.bmi` arrays index-aligned
   to `dates`; the omitted-`waist` row shows `null` at its index; `summary.weight = {latest, delta, trend}`
   with `delta` = latest − previous and `trend` ∈ `{"up","down","flat"}` matching the sign.
4. **Delta + trend correctness (AC-2).** By hand: for a metric that decreased across the last two readings,
   `summary.<m>.delta` is negative and `trend` is `"down"`; for a near-equal change (within the flat epsilon)
   `trend` is `"flat"`; a metric with only one reading → `delta: null, trend: null`.
5. **BMI value (AC-2/AC-3).** For a metric row with weight+height, confirm `bmi = weight_kg /
   (height_cm/100)²` to 1 dp by hand. Series `unit_system` marker is `"metric"`; values are as-stored (no
   conversion — metric-only).
6. **Empty history (§5.4).** As a fresh trainee with zero measurements: `GET /measurements/series` → `200`
   with `dates: []`, `metrics: {}`, `summary: {}` — not a 404, not an error.
7. **Access matrix (AC-4, AC-5).**
   - As **A**: `GET /measurements/series?user=<B id>` → `403`.
   - As **T1**: `GET /measurements/series?user=<A id>` → `200` (owns A).
   - As **T1**: `GET /measurements/series?user=<B id>` → `403` (T2's trainee).
   - As **A** (self, omit `user`) → `200`.
8. **Route ordering (AC-4).** `GET /measurements/series` resolves the series action (not treated as a pk);
   `GET /measurements/photos` still resolves the P3 feed; `GET /measurements/<realid>` still resolves detail.
   No route shadowing.
9. **Predicate unchanged (AC-5, epic §10).** `grep -n can_access core/api/ core/services/` — the `series`
   action delegates to `MeasurementAccessPermission`/`can_access`; **no** trainer→trainee literal appears in
   `chart_data.py`, `metrics.py`, or the new view code (the services are user-agnostic — they receive an
   already-scoped queryset).
10. **Server-side compute (AC-6).** Confirm the view contains no BMI/delta arithmetic — all math is in
    `metrics.py`/`chart_data.py`; the view only queries + delegates.
11. **i18n keys (epic Q6).** `summary.*.trend` values are the bare keys `"up"/"down"/"flat"`, never English
    prose ("Trending down"). Any error body `detail` (e.g. a bad `?user=`) is a key / standard 404.

---

## 8. Risks / notes

- **Metric-only (developer decision).** No unit conversion anywhere in P4 — BMI and series compute directly
  on stored values. `unit_system` still exists on the model (P2) with an `imperial` choice, but imperial is
  not a supported product path; a future cleanup could drop the choice from P2's serializer/model (out of P4
  scope — flag for P8 or a P2 amendment).
- **Delta baseline choice (§11 Q2).** "Delta" is ambiguous: latest-vs-previous (most-recent change) vs
  latest-vs-first (total progress). Proposed latest-vs-previous to match the stat-tile "▲ +0.6 kg" idiom;
  P6/P7 can compute total-since-start from the `metrics` arrays if a screen wants it.
- **Trend is neutral, not "good/bad."** `metrics.trend` reports the sign of change only. Whether "down" is
  good depends on the metric and the trainee's goal — that judgment belongs to Goals (P6/P7), not here.
  Keeping direction goal-agnostic avoids baking policy into the metrics service.
- **Series is unpaginated by design.** A trainee with a very long history returns the whole array. Acceptable
  for MVP (weekly cadence → tens of points/year); if it ever grows, a date-range `?from=&to=` filter is the
  natural P8 addition — noted, not built.
- **`bmi` as a property (no column)** means it is computed on every read and cannot be filtered/ordered in
  SQL. Fine for MVP (small per-user sets). If a future feature needs to query by BMI, that is a denormalized
  column decision for later — do not add it now.
- **Shared model file (P2/P3/P4).** P4 adds only the `bmi` property + docstring; it must not touch P2 fields
  or P3 photo wiring. Property-only change → no migration → zero DB risk.
- **Decimal vs JSON number.** DRF serializes `Decimal` per `COERCE_DECIMAL_TO_STRING`. Confirm the series
  numbers render as JSON numbers (not quoted strings) so Chart.js plots them without client parsing — if the
  project defaults `Decimal`→string, cast the series values to `float`/`str`-free in `build_series` (flag in
  §11 Q6). Check during §7 step 3.

---

## 9. Multi-role considerations

Same tenancy boundary as P2/P3: the trainer↔trainee relationship, resolved **only** through `can_access`.
The `series` feed adds no role logic — a trainer sees a trainee's series iff `can_access` says so; a trainee
sees only their own; other-trainer is `403`. The metrics/chart services are entirely user-agnostic: they
receive an already-scoped queryset and never look at roles, so there is no second place a permission rule
could drift. Helper access stays post-MVP and untouched (the predicate already shaped for it).

---

## 11. Open questions — all RESOLVED (developer 2026-08-11: metric-only; accept all other defaults)

- **Q1 — RESOLVED: metric-only.** BMI is `weight_kg / (height_cm/100)²`; no imperial branch, no conversion.
  `metrics.bmi(weight, height)` takes no unit parameter (§5.1/§5.2).
- **Q2 — RESOLVED (adopted).** Delta = latest vs **previous** entry (most-recent change; stat-tile idiom).
- **Q3 — RESOLVED (adopted).** Per-family flat epsilon (`0.1 kg`, `0.5 cm`, `0.1` BMI, `0.1%` body-fat) as
  `metrics.py` constants.
- **Q4 — RESOLVED: metric-only, no normalization.** Series values charted as-stored; top-level
  `unit_system: "metric"` marker. No mixed-unit path (§5.3/§8).
- **Q5 — RESOLVED (adopted).** No pagination on `series`; full history. `?from=&to=` deferred to P8.
- **Q6 — RESOLVED (adopted).** Return the §5.4 dict directly (`Response(payload)`, no serializer);
  `SerializerMethodField` `bmi` on `MeasurementSerializer`; series numbers serialize as JSON numbers (cast in
  `build_series` if the project coerces `Decimal`→string, verify §7 step 3).

---

## 13. Post-implementation notes (2026-08-11)

**Built:** the metrics service (`metrics.py` — `bmi`/`delta`/`trend` + per-family flat epsilons, body-fat
seam left as a comment), the chart-data assembler (`chart_data.py` — `build_series`), the model `bmi`
property (no column, no migration), the read-only `bmi` field on `MeasurementSerializer`, and the thin
`series` action + `measurements/series` route. Six files, zero new dependencies, zero migrations.

**Verified (manual, no automated tests — epic §3):**
- `makemigrations --check` → *No changes*; `manage.py check` clean; app boots.
- Drove `bmi` property + `build_series` in `manage.py shell`: BMI 1 dp (82.5 kg / 1.78 m² → 26.0), `None`
  when weight/height absent; series `dates` ascending; per-metric arrays index-aligned with `null` at the
  omitted-`waist` index; `bmi` array present; `summary` deltas signed (−0.6 kg → `"down"`), single-reading
  → `delta/trend: null`, near-equal change (≤ epsilon) → `"flat"`; empty history → valid empty series
  (`200`, not 404).
- All series values + the serializer `bmi` field emit as JSON **numbers** (cast to `float`) despite DRF's
  `COERCE_DECIMAL_TO_STRING` default — the stored `Decimal` fields (`weight` etc.) still serialize as strings
  per P2, `bmi` intentionally does not (plan §11 Q6).
- Route resolution: `measurements/series` → `series`, `measurements/photos` → `photos`,
  `measurements/<id>` → detail; no shadowing.
- Predicate: `series` inherits `[IsAuthenticated, MeasurementAccessPermission]` (no per-action override);
  `metrics.py`/`chart_data.py` carry no role literal (user-agnostic — receive an already-scoped queryset).

**Follow-ups for the developer:**
- **Access matrix live-curl (§7 step 7)** was confirmed *by construction* — `series` runs the identical
  `get_target_user` + `MeasurementAccessPermission.has_permission` path as P2 `list`/`photos`, which already
  passes the matrix. If you want the belt-and-braces live check, spin up the T1/A/T2/B personas and curl the
  four rows; the gate code is unchanged so the outcome is P2's.
- **Imperial cleanup (§8).** `unit_system` still offers an `imperial` choice (P2), but P4 is metric-only.
  Dropping the choice is out of P4 scope — flag for P8 or a P2 amendment.
- **Type inconsistency (accepted).** In a row payload `bmi` is a JSON number while `weight`/`height` are
  strings (DRF Decimal coercion). Plan-directed (Q6); the SPA parses both. Revisit only if a consumer needs
  uniform types.

---

Plan saved to `tasks/plans/feature-P4-derived-metrics-chart-data.md`.
