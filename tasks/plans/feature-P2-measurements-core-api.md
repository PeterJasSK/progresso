# Feature Plan: P2 — Measurements Core API

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved)
**Plan ID:** P2
**Slug:** measurements-core-api
**Author:** Claude (Opus)
**Date:** 2026-08-11
**Status:** Complete (implemented + manually verified 2026-08-11; no automated tests per epic §3)

> No GitHub issue. ACs are quoted from the design docs (`tasks/design/*.md`) via the epic §9 P2 brief.
> P1 already shipped the Django + DRF scaffold, `CustomUser` + `can_access`, and the auth surface. P2
> hangs the first domain resource — measurements — off that skeleton.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7.

---

## 1. Goal

Deliver the **Measurement model** (units + range validation) and its **CRUD API** — the data spine of
the core loop (trainee logs body numbers → trainer reviews). Concretely:

- `Measurement` model: owner FK, `unit_system` (metric/imperial), the body-metric numeric fields with
  **sane min/max validators** (kills garbage like `5000 kg` — `rebuild-analysis.md` §2 #8), optional
  `body_fat_pct` input, `created_at`.
- A **thin** DRF viewset for `list / create / retrieve / patch / delete`, every path resolving access
  through the single `can_access` predicate from P1 — no new inline role-access checks.
- Route-level rules from `mvp-routes.md` §C wired: trainee sees only own rows and cannot pass another
  `user` id; create is trainee-only and always `user = self`; trainer reads own trainees; **edit/delete
  is owner-trainee only**.

Out of scope for P2 (owned by later plans): photo bytes + thumbnails (P3), the `bmi` property and the
`measurements/series` chart endpoint + derived metrics (P4). The `Measurement` model file is shared —
P2 introduces the numeric fields, P3 adds the photo/thumbnail fields + save hook, P4 adds the `bmi`
property. P2 must leave the model open for those additions without a rewrite.

---

## 2. Acceptance criteria (quoted from design docs via epic §9 P2 brief)

| AC | Covered by |
|----|-----------|
| AC-1 CRUD API + validation + units | `core/api/views.py:94` (`MeasurementViewSet`), `core/api/urls.py:31,33`, `core/api/serializers.py:99` |
| AC-2 model: unit_system, min/max validators, created_at, optional body_fat_pct | `core/models/measurement.py:37` (fields 45–124), `core/migrations/0002_measurement.py` |
| AC-3 garbage rejected 400 + translatable key | `core/api/serializers.py:174` (`validate`), `:203` `out_of_range`, `:214` `no_values`, `:184/188` `invalid_unit_system`; verified §7.3 |
| AC-4 endpoints + verb behaviour | list/create `core/api/views.py:114,129`; detail scoping `:120`; routes `core/api/urls.py:31,33`; verified §7.2/5/7/8/9 |
| AC-5 permissions via can_access; create trainee-self; edit/delete owner-only | `core/api/permissions.py:61` (`MeasurementAccessPermission`), `:46` (`IsTrainee`), `:99/101`; verified §7.6/8/9/10 |
| AC-6 zero re-implemented predicate | reads delegate to `can_access` (`permissions.py:92,99`); queryset scoping lives on the model `core/models/user.py:71` (`accessible_data_filter`), not the view; verified §7.11 grep |

- **AC-1** "Measurement CRUD API with validation + units." (`rebuild-analysis.md` §6 B1)
- **AC-2** Model adds "`unit_system` (metric/imperial), field validators (sane min/max) … `created_at`."
  (`rebuild-analysis.md` §5 Measurement). `body_fat_pct` is present as an **optional input** in P2 (its
  *derivation* is post-MVP; its consumption by BMI/derived is P4).
- **AC-3** "**No units, no range validation** on measurements … Garbage data (5000 kg) accepted." — must
  be fixed (`rebuild-analysis.md` §2 #8). A create/patch carrying an out-of-range value is rejected `400`
  with a translatable key; a create with no `unit_system` is rejected.
- **AC-4** Endpoints exist and behave per `mvp-routes.md` §B Measurements:
  - `GET /api/v1/measurements?user=:id` — list. Trainee **omits** `user` → own rows; trainer passes a
    trainee's `user` id they own. Passing a `user` you can't access → `403`.
  - `POST /api/v1/measurements` — trainee only; creates own (`user` forced to `self`, any `user` in the
    body ignored). (Multipart photo lands in P3; P2 accepts the numeric JSON body.)
  - `GET /api/v1/measurements/:id` — owner trainee, or trainer who owns that trainee.
  - `PATCH /api/v1/measurements/:id` — **owner trainee only** (edit own entry).
  - `DELETE /api/v1/measurements/:id` — **owner trainee only** (blob cleanup wired in P3).
- **AC-5** Permission rules per `mvp-routes.md` §C, all resolved through `can_access` (no new inline role
  data-access check): trainee self-only and cannot pass another `user` id; create always `user = self`;
  trainer reads own trainees; other-trainer → `403`.
- **AC-6** (epic §10) Zero duplicated views; the one authorization predicate stays the only access
  authority — the viewset consumes `request.user.can_access(target)`, it does not re-implement it.

### Permission matrix — manual verification checklist (epic §5; no automated tests)

For `{trainee, trainer(owns), other-trainer} × {own data, other's data}` the measurements endpoints must
yield `{200, 403}` as below. Verified by hand in §7.

| Caller | Target rows | GET list | GET/PATCH/DELETE :id | POST |
|--------|-------------|----------|----------------------|------|
| trainee | self | 200 | 200 (all verbs) | 201 |
| trainee | another user's | 403 | 403 | n/a (`user` forced to self) |
| trainer | own trainee | 200 | GET 200; PATCH/DELETE **403** (owner-only) | **403** (trainer can't create) |
| trainer | other trainer's trainee | 403 | 403 | 403 |
| admin (`is_superuser`/role admin) | anyone | 200 | GET 200; PATCH/DELETE per owner rule | — |

---

## 3. Out of scope (deferred — do not build in P2)

- **Photo bytes + thumbnail generation + blob delete-on-delete** → P3. P2 adds **no** photo field to the
  model and no multipart handling; the `POST` is numeric JSON only. (P3 extends the same model + serializer.)
- **`bmi` property, `measurements/series` chart endpoint, derived deltas/trend** → P4.
- **`measurements/photos` compare-picker endpoint** → P3.
- **Goals** (`goals` model + endpoints) → P6/P7.
- **Trainer-side roster / `trainees` endpoints** → P7. P2 only reads measurements by `user` id through
  `can_access`; it does not add a roster route.
- **Rate-limiting, `export/delete-my-data`, deep query-optimization pass** → P8 hardening. (P2 does add
  the obvious `select_related` on the owner + list pagination; see §5.6.)
- **Body-fat *derivation*** → post-MVP. P2 stores `body_fat_pct` only if the trainee typed it.

---

## 4. Cross-cutting decisions this plan adopts (from epic §3, no re-litigating)

- **One authorization predicate.** The viewset resolves a target user and calls
  `request.user.can_access(target)` (P1 `core/models/user.py:46`). No new `if role ==` **data-access**
  decision. Role *gating* ("create is trainee-only") is an explicit, separate endpoint concern (epic §3,
  P1 permissions docstring) — expressed as a dedicated permission class, not folded into `can_access`.
- **Layered layout.** Model in `core/models/measurement.py`; thin viewset in `core/api/views.py`;
  serializer in `core/api/serializers.py`; permission classes in `core/api/permissions.py`. No logic in
  URLconf.
- **Thin views.** All validation/coercion lives in the serializer; the viewset only wires querysets,
  permissions, and the forced-owner on create.
- **No raw SQL.** Django ORM only; validators via Django field/serializer validators.
- **strict typing + PEP 8.** Every new module opens with `from __future__ import annotations`; full type
  hints on every function/method.
- **i18n (epic Q6).** Every validation error `detail` is a translation **key**, not English prose (mirrors
  P1 `serializers.py`), so the SPA localizes it.
- **Host-agnostic / no data files in git.** No new committed data; SQLite dev, Postgres prod unchanged.

---

## 5. Design / approach

### 5.1 `core/models/measurement.py` — the `Measurement` model

New module. Fields:

- `user` — `ForeignKey(settings.AUTH_USER_MODEL, on_delete=CASCADE, related_name="measurements")`. The
  owning trainee. `CASCADE` so deleting a user removes their measurements (blob cleanup on that cascade is
  wired in P3; noted, not built here).
- `unit_system` — `CharField(max_length=8, choices=UnitSystem.choices, default=METRIC)`, where
  `UnitSystem` is a `TextChoices` (`METRIC = "metric"`, `IMPERIAL = "imperial"`). **Required** (has a
  default; the serializer still forbids an explicit blank).
- Body-metric numeric fields — all `DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)`,
  each with a `MinValueValidator`/`MaxValueValidator` pair sized to catch garbage (see §5.2). Proposed set
  (`rebuild-analysis.md` §1: "weight, height, chest, waist, biceps, thigh, calf"; `hips` from
  `mvp-routes.md`/`design-preview.html`):
  - `weight`, `height`, `chest`, `waist`, `hips`, `biceps`, `thigh`, `calf`.
- `body_fat_pct` — `DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)` with `0–75`
  validators. Optional **input** only in MVP (derivation post-MVP).
- `created_at` — `DateTimeField(auto_now_add=True)`. Server timestamp; also the chart x-axis in P4.
- `measured_at` — see §11 Q3 (proposed: `DateField` defaulting to today, editable) — **pending decision**.

Model `Meta`: `ordering = ["-created_at"]` (newest first for the list). `__str__` returns
`f"{self.user} @ {self.created_at:%Y-%m-%d}"`. No `bmi` property yet — P4 adds it.

Model-level validators are the floor (they also protect the Django admin). The unit-aware range check
lives in the serializer (§5.3), because sane ranges differ for metric vs imperial.

### 5.2 Range validation (kills AC-3 garbage)

Two layers:

1. **Model field validators** — absolute floor/ceiling wide enough to admit both unit systems but reject
   nonsense, so a bad value can never reach the DB even via admin. e.g. `weight` `MinValueValidator(0)` /
   `MaxValueValidator(1000)`; circumferences `0`–`400`; `height` `0`–`300`; `body_fat_pct` `0`–`75`.
2. **Serializer unit-aware ranges** (`validate()`, branching on `unit_system`) — the *tight* check the AC
   wants. Proposed bands:

   | Field | metric (kg/cm) | imperial (lb/in) |
   |-------|----------------|------------------|
   | weight | 20–400 | 44–880 |
   | height | 50–250 | 20–98 |
   | chest/waist/hips/biceps/thigh/calf | 10–250 | 4–100 |
   | body_fat_pct | 0–75 | 0–75 |

   A value outside its band → `serializers.ValidationError({field: "out_of_range"})`.

Also enforce **at least one measurement value present** (all-null body metrics is a meaningless entry) →
`400 no_values`.

### 5.3 `core/api/serializers.py` — `MeasurementSerializer` (edit, add class)

`MeasurementSerializer(serializers.ModelSerializer)`:

- `fields = ("id", "user", "unit_system", "weight", "height", "chest", "waist", "hips", "biceps",
  "thigh", "calf", "body_fat_pct", "created_at")` (+ `measured_at` if Q3 accepted).
- `user` — **read-only** (`read_only=True`). Ownership is never client-set; the viewset forces it to
  `request.user` on create (§5.4). This is how "create always `user = self`" (`mvp-routes.md` §C) is
  guaranteed — a `user` in the body is ignored, not honored.
- `created_at` — read-only.
- `validate(self, attrs)` — the unit-aware range pass (§5.2) + the at-least-one-value rule. Error
  `detail`s are translation keys (`out_of_range`, `no_values`, `invalid_unit_system`).
- Decimal fields typed and hinted; `null`/`blank` honored so a partial `PATCH` of one metric works.

### 5.4 `core/api/views.py` — `MeasurementViewSet` (edit, add class; keep it thin)

`class MeasurementViewSet(viewsets.ModelViewSet)`:

- `serializer_class = MeasurementSerializer`.
- `def get_queryset(self)` → resolves the **target user** and returns
  `Measurement.objects.filter(user=target).select_related("user")`. Target resolution:
  - `list`: `user` query param if present, else `request.user` (trainee omits it → self). The permission
    class (§5.5) has already asserted `can_access(target)`, so an unauthorized `user` id never reaches a
    queryset — it is `403`'d first.
  - detail actions (`retrieve`/`update`/`destroy`): queryset is the full set filtered to accessible rows;
    object-level permission (§5.5) gates the specific row. To avoid leaking existence, base the detail
    queryset on rows the caller can read, so an inaccessible `:id` returns `404`/`403` consistently.
- `def get_target_user(self, request)` → returns the `CustomUser` named by `?user=` (via `get_object_or_404`
  on the user model) or `request.user` when absent. This is the exact hook `CanAccessTarget` from P1
  expects (`core/api/permissions.py:39`) — reused, not reinvented.
- `def perform_create(self, serializer)` → `serializer.save(user=self.request.user)` — the forced owner.
- `permission_classes` = `[IsAuthenticated, MeasurementAccessPermission]` (§5.5).
- No business logic beyond this wiring (thin view, epic §3).

### 5.5 `core/api/permissions.py` — access + role gating (edit, add classes)

Two concerns, kept separate (epic §3):

- **`MeasurementAccessPermission(BasePermission)`** — the access gate, delegating to `can_access`:
  - `has_permission`: for the **list** and **create** collection actions, resolve the target via the
    view's `get_target_user` and return `request.user.can_access(target)`. For `create` also require the
    caller be a trainee (role gating — see next bullet) and that the resolved target is self.
  - `has_object_permission`: for **safe** methods return `request.user.can_access(obj.user)`; for
    **unsafe** methods (`PATCH`/`DELETE`) return `obj.user_id == request.user.pk` **and** the caller is a
    trainee — i.e. *owner-trainee only*, matching `mvp-routes.md` §C ("edit/delete own"). A trainer who
    can *read* a trainee's row still cannot edit or delete it.
  - It never re-implements the trainer→trainee rule; that lives solely in `can_access`.
- **`IsTrainee(BasePermission)`** — explicit role gating for create (`request.user.role == Role.TRAINEE`).
  This is endpoint gating, not a data-access decision, so it is a legitimate separate class (P1 permissions
  docstring already anticipates this). Compose it into the create branch above, or list it and short-circuit
  by action.

Keep `CanAccessTarget` (P1) intact; `MeasurementAccessPermission` may subclass or reuse its
`get_target_user` contract so the "view exposes a target resolver" pattern stays uniform.

### 5.6 `core/api/urls.py` — routes (edit)

Register the viewset on a DRF `DefaultRouter` (or explicit paths mirroring P1's style — see §11 Q5):

- `GET/POST /api/v1/measurements` → list/create.
- `GET/PATCH/DELETE /api/v1/measurements/<pk>` → retrieve/update/destroy.

Router `basename="measurement"`. `series` and `photos` sub-paths are **not** registered here (P3/P4). If a
router's auto-routes would collide with the future `measurements/series` literal path, prefer explicit
paths now to keep P4 free to add `measurements/series` without a trailing-slash/pk clash — noted in §8.

### 5.7 Pagination (list scalability, epic NFR §7)

Add DRF pagination so `GET /measurements` is bounded. Proposed: `PageNumberPagination`, `PAGE_SIZE = 50`,
set as `DEFAULT_PAGINATION_CLASS`/`PAGE_SIZE` in `progresso/settings/base.py` (applies app-wide; harmless
for the tiny auth lists). Response becomes the standard `{count, next, previous, results}` envelope — P6
charts/list consume `results`. (Deep perf tuning stays in P8.)

### 5.8 `core/models/__init__.py` + `core/admin.py` (edit)

- `__init__.py`: re-export `Measurement`, `UnitSystem` alongside the existing `CustomUser`, `Role`.
- `admin.py`: register `Measurement` (list_display: user, created_at, weight, unit_system) so admin can
  spot-check — admin stays outside the SPA (epic §3).

---

## 6. File Plan

New modules open with `from __future__ import annotations`; full type hints; PEP 8. No test files (epic §3).

| File | Change | Notes |
|------|--------|-------|
| `core/models/measurement.py` | **new** | `Measurement` + `UnitSystem`; fields, validators, `Meta.ordering`, `__str__` (§5.1–5.2). No photo (P3), no `bmi` (P4). |
| `core/models/__init__.py` | edit | re-export `Measurement`, `UnitSystem` (§5.8) |
| `core/api/serializers.py` | edit | add `MeasurementSerializer`: read-only `user`, unit-aware `validate()`, translatable keys (§5.3) |
| `core/api/permissions.py` | edit | add `MeasurementAccessPermission` (+ `IsTrainee`); delegate reads to `can_access`, owner-only writes (§5.5) |
| `core/api/views.py` | edit | add thin `MeasurementViewSet`: `get_target_user`, `get_queryset`, `perform_create` forces owner (§5.4) |
| `core/api/urls.py` | edit | register measurements list/detail routes (§5.6) |
| `core/admin.py` | edit | register `Measurement` for admin spot-checks (§5.8) |
| `progresso/settings/base.py` | edit | add DRF pagination defaults (§5.7) |
| `core/migrations/0002_measurement.py` | **new (generated)** | `makemigrations` — the `Measurement` table + FK + validators |

No `CLAUDE.md` change (still deferred, epic P1 Q5). No frontend (P5+).

---

## 7. Manual verification (no automated tests — epic §3)

Prereq: a trainer T1, its trainee A, a second trainer T2, and T2's trainee B — all created via the P1
open-registration flow (`§7.3a` of the P1 plan). Log in per persona to get a session cookie + CSRF token
(`GET /auth/me` seeds `csrftoken`; send `X-CSRFToken` on unsafe requests).

1. **Migrate (AC-1, AC-2).** `python manage.py makemigrations core` → `0002_measurement.py`;
   `python manage.py migrate` clean. `python manage.py runserver` boots.
2. **Create own, valid (AC-1, AC-4 POST).** As trainee A: `POST /api/v1/measurements`
   `{"unit_system":"metric","weight":82.5,"waist":88,"chest":102}` → `201`; response `user` == A's id
   (never client-set). Repeat with a second entry (for the list/ordering check).
3. **Garbage rejected (AC-3).** As A: `POST` `{"unit_system":"metric","weight":5000}` → `400`
   `{"weight":"out_of_range"}`. `POST` `{"unit_system":"metric"}` (no values) → `400 no_values`.
   `POST` `{"unit_system":"bogus","weight":80}` → `400` (bad choice / `invalid_unit_system`). Missing
   `unit_system` uses the model default `metric` — confirm that is the intended behavior (§11 Q2).
4. **Owner forced on create (AC-4, AC-5).** As A: `POST` with a body that includes
   `"user": <B's id>` → still `201` with `user` == A (the `user` field is ignored, not honored).
5. **List self (AC-4 GET).** As A: `GET /api/v1/measurements` (no `user`) → `200`, paginated envelope,
   only A's rows, newest first.
6. **List others — the matrix (AC-5).**
   - As A: `GET /api/v1/measurements?user=<B id>` → `403`.
   - As trainer T1: `GET /api/v1/measurements?user=<A id>` → `200` (owns A).
   - As trainer T1: `GET /api/v1/measurements?user=<B id>` → `403` (T2's trainee).
7. **Detail read (AC-4, AC-5).** Grab an A measurement id `M`.
   - As A: `GET /measurements/M` → `200`. As T1: `GET /measurements/M` → `200`. As T2: → `403`/`404`.
8. **Edit is owner-only (AC-4 PATCH).** As A: `PATCH /measurements/M {"waist":86}` → `200`, value
   updated. As T1 (owns A but not owner): `PATCH /measurements/M` → `403`. Out-of-range `PATCH`
   `{"weight":5000}` → `400 out_of_range`.
9. **Delete is owner-only (AC-4 DELETE).** As T1: `DELETE /measurements/M` → `403`. As A:
   `DELETE /measurements/M` → `204`; a subsequent `GET /measurements/M` → `404`.
10. **Trainer cannot create (AC-5).** As T1: `POST /api/v1/measurements {...}` → `403` (create is
    trainee-only). As A (trainee): create still `201`.
11. **Predicate unchanged (AC-6).** Confirm the viewset/permission code calls
    `request.user.can_access(target)` and contains **no** re-implemented trainer→trainee branch (grep
    `can_access` in `core/api/`; the only role literal is the explicit `IsTrainee` create gate).
12. **i18n keys (epic Q6).** Every `400/403` body `detail` is a key (`out_of_range`, `no_values`,
    `invalid_unit_system`), not an English sentence.

---

## 8. Risks / notes

- **Shared model file across P2/P3/P4.** P2 must not pre-empt P3's photo fields or P4's `bmi` property,
  but should leave the model obviously extensible (docstring noting the split). Adding photo/`bmi` later
  is a field-add migration — fine because greenfield.
- **Router vs future `measurements/series` (P4) & `measurements/photos` (P3).** A `DefaultRouter` maps
  `measurements/<pk>` — a literal `measurements/series` path added later must be registered *before* the
  router's pk route or as an explicit `path()` so `series` isn't captured as a pk. Flag for P4; consider
  explicit `path()`s in P2 to sidestep it (§11 Q5).
- **`unit_system` is per-row, values stored as entered.** No normalization to metric on save (keeps input
  lossless; P4/P6 convert for display/comparison if needed). Cross-unit chart series is a P4 concern.
- **`CASCADE` on `user`.** Deleting a user deletes their measurements. Blob cleanup on that cascade is a
  P3 responsibility (`mvp-routes.md` §B Users "cascades; cleans blobs") — P2 leaves the FK cascade in
  place and P3 wires the blob side.
- **Pagination envelope changes list shape** app-wide (also the P1 `/auth/trainers` list). Harmless for
  MVP; note it so P5/P7 read `results`.

---

## 11. Open questions — all RESOLVED (developer 2026-08-11: yes to all defaults)

- **Q1 — RESOLVED (adopted).** Field set: `weight, height, chest, waist, hips, biceps, thigh, calf` +
  optional `body_fat_pct`. `neck`/`shoulders` excluded (not in docs).
- **Q2 — RESOLVED (adopted).** Model keeps `default="metric"`, but the serializer **requires**
  `unit_system` explicitly on create; `PATCH` may omit it.
- **Q3 — RESOLVED (adopted).** Add `measured_at = DateField(default=today, editable)` distinct from
  `created_at`; P4 series uses `measured_at`.
- **Q4 — RESOLVED (adopted).** `PageNumberPagination`, `PAGE_SIZE = 50`.
- **Q5 — RESOLVED (adopted).** Explicit `path()`s for `measurements` + `measurements/<int:pk>` (P1 style),
  keeping `measurements/series` (P4) and `measurements/photos` (P3) collision-free.
- **Q6 — RESOLVED (adopted).** 404 for inaccessible/nonexistent reads (no existence leak); 403 for
  authenticated-but-blocked writes.

---

Plan saved to `tasks/plans/feature-P2-measurements-core-api.md`.

---

## 13. Post-implementation notes

**Built:** `Measurement` model + `UnitSystem` (`core/models/measurement.py`), migration
`0002_measurement.py`, `MeasurementSerializer` (unit-aware range validation, translatable keys),
`MeasurementViewSet` (thin: `get_target_user` / `get_queryset` / `perform_create`),
`MeasurementAccessPermission` + `IsTrainee`, explicit `measurements` + `measurements/<int:pk>` routes,
DRF `PageNumberPagination PAGE_SIZE=50`, admin registration. All ACs verified by hand over live
`runserver` across the `{trainee, trainer, other-trainer}` matrix — every cell matched §2.

**Deviations / decisions made during implementation:**

1. **Serializer field validators stripped (design refinement, not scope change).** DRF `ModelSerializer`
   copies the model's `MinValueValidator`/`MaxValueValidator` onto the serializer fields, so an
   out-of-range value >the model ceiling (e.g. `weight=5000`) failed at field level with DRF's **English**
   prose (`"Ensure this value is less than or equal to 1000."`) instead of the translatable
   `out_of_range` key — violating AC-3 / epic Q6. Fix: `MeasurementSerializer.__init__`
   (`serializers.py:132`) removes those inherited validators so the unit-aware `validate()` band is the
   single API-layer range authority and always returns `out_of_range`. The **model** validators stay as
   the DB/admin floor (§5.2 intent preserved).

2. **Queryset scoping moved to the model (AC-6 compliance).** The detail `get_queryset` must restrict to
   readable rows so an inaccessible id 404s (Q6) — but writing that filter as
   `Q(user__head_trainer=user)` in the viewset would re-encode the trainer→trainee rule the epic §10 says
   must live only in the access predicate. Added `CustomUser.accessible_data_filter()`
   (`core/models/user.py:71`) beside `can_access`; the view consumes it. Result: no trainer→trainee data
   literal in `core/api/`; the only role literals there are the `Role.TRAINEE` **gating** checks
   (create-is-trainee, edit/delete-owner-is-trainee), which epic §3 explicitly allows as separate endpoint
   concerns.

3. **`unit_system` required on create (Q2).** §7 step 3's aside ("missing `unit_system` uses model
   default") is superseded by resolved Q2 — a create omitting `unit_system` is rejected
   `{"unit_system":"invalid_unit_system"}`. `PATCH` may omit it (falls back to the stored value).

**Follow-ups for the developer:**

- **No `./ops cs`** in the repo (plan §4 / CLAUDE.md reference it, but neither `CLAUDE.md` nor `ops` exist
  yet). Lint gate used was `python manage.py check` (clean) + `makemigrations --check` (no drift). Wire an
  actual `ops cs` / formatter when the toolchain lands.
- **Implemented on `main`** (developer chose to skip the `feature-P2` branch).
- **Pagination envelope** now wraps the measurements list as `{count,next,previous,results}`. Confirmed it
  does **not** change `/auth/trainers` (that's a hand-rolled `APIView.get`, unaffected by DRF's global
  pagination) — P5/P7 read `results` only for measurements.
- **`measured_at`** added per Q3 as `DateField(default=timezone.localdate)`; exposed in the serializer,
  P4 series will plot on it.
