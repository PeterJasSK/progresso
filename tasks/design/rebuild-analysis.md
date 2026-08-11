# Trener App — Rebuild Analysis & Epic Blueprint

> Purpose: a deep analysis of the existing app plus a concrete plan for rebuilding it **better**. Written to seed epic/feature planning. Read this before writing tickets.

---

## 1. What the product actually is

A remote personal-training platform. A trainer coaches clients ("trainees") at a distance. The core loop:

1. Trainee periodically records **body measurements** (weight, height, chest, waist, biceps, thigh, calf) and a **progress photo**.
2. Trainer reviews **trends over time** (charts) and **photo comparisons** to judge progress.
3. Trainer sends **training plans**, sets **goals**, and **chats** with the trainee.

The measurement + photo history is the heart of the product. Everything else (chat, goals, plans) exists to drive and act on that data.

### Roles
- **Trainer** (head): owns trainees, sees their data, coaches them.
- **Assistant trainer** (helper): delegated access to a head trainer's trainees.
- **Trainee**: records own data, sees own trends, receives plans/goals.
- **Admin**: superuser, Django admin.

---

## 2. Honest audit of the current build

### What works / is worth keeping
- Domain concept is sound: role-based trainer↔trainee with measurement + photo history.
- Vercel Blob storage backend is clean, dependency-free, correctly lazy on the token.
- Deployment story (Vercel serverless + Postgres + WhiteNoise) is real and documented in settings.

### What is broken or weak (drives the rebuild)

| # | Problem | Impact |
|---|---------|--------|
| 1 | **`views.py` defines every view twice.** Python keeps the last def, silently drops the first. | Dead code, and the surviving `measurement_detail` has *weaker* access checks (drops the `trainees` branch) — helper access silently broken. |
| 2 | **Authorization logic copy-pasted 8+ times, each subtly different.** No single source of truth. | Any missed branch = cross-trainer data leak. Unmaintainable. |
| 3 | **Zero tests** (`core/tests.py` empty) despite heavily branched permission code. | Every change risks a silent security regression. |
| 4 | **`db.sqlite3` and `media/` committed to git.** | Real data in repo; ephemeral serverless FS makes SQLite writes meaningless in prod. |
| 5 | **Chat is HTML-partial polling** (`X-Requested-With` returns rendered `_messages.html`). Re-fetches the whole thread each poll, marks-read each poll. | Doesn't scale; awkward hybrid of API and server-render. |
| 6 | **No training-plan model at all**, though README says the trainer "sends a training plan." | Core advertised feature missing. |
| 7 | **Goals are free-text + date only**; not measurable, not linked to measurements. | No auto-progress; goals are just notes. |
| 8 | **No units, no range validation** on measurements. | Garbage data (5000 kg) accepted. |
| 9 | **Blob delete never wired** to measurement deletion. | Orphaned blobs → storage leak + cost. |
| 10 | Monolithic `views.py`, monolithic template folder, no service layer. | Hard to reason about, hard to test. |

**Conclusion:** the data model is close, but the code organization, authorization design, and test posture make incremental fixing risky. A structured rebuild — reusing the domain, replacing the architecture — is justified.

---

## 3. Rebuild goals (the "why better")

1. **One authorization model, tested.** Access rules live in exactly one place with a full permission test matrix. No cross-trainer leaks, ever.
2. **API-first.** A clean JSON API decouples frontend from backend, kills the polling-HTML hack, and enables a real mobile experience.
3. **Mobile-first capture.** Trainees log measurements + snap photos from a phone in <30s. This is where data actually gets created.
4. **Measurable goals + real training plans.** Close the coaching loop the README promises.
5. **Derived insight, not just raw numbers.** BMI/body-fat estimates, deltas, trend direction — compute on the data you already collect.
6. **Photo comparison that's actually useful.** Overlay/slider, date-aligned, pose guidance.

---

## 4. Target architecture

### Stack
- **Backend:** Django + **Django REST Framework** (JSON API). Keep Django ORM + auth — they're the strong parts.
- **Auth:** token/session for web, JWT for mobile/PWA. DRF permission classes replace inline `if role` checks.
- **Frontend:** SPA/PWA (React or the framework the team knows). Mobile-first, installable, offline-tolerant capture queue.
- **DB:** Postgres (managed). SQLite only for local dev, never committed.
- **Media:** keep Vercel Blob backend; add lifecycle (delete on measurement delete, thumbnail generation).
- **Realtime chat:** SSE or WebSockets (Channels) instead of polling; start with "fetch since timestamp" if realtime is out of first scope.
- **Deploy:** Vercel (or container host). CI runs the test suite on every push.

### Layered layout (replaces the monolith)
```
core/
  models/           measurement.py, goal.py, plan.py, message.py, user.py
  api/
    serializers.py
    views.py        DRF viewsets, thin
    permissions.py  <-- SINGLE source of access truth
  services/         chart_data.py, metrics.py (BMI/bodyfat), blob_cleanup.py
  tests/            test_permissions.py, test_measurements.py, ...
```

### The one authorization rule
Centralize as a single predicate, e.g. `user.can_access(target_user)` on the user model, consumed by every DRF permission class:
- trainee → self only
- trainer → own trainees (head) + trainees where assigned as helper
- helper → head's trainees they're attached to
- admin → all

Every endpoint uses it. One test file proves the full matrix.

---

## 5. Domain model (rebuilt)

Keep `CustomUser` (role, head_trainer, helpers) — it's fine. Fix and extend the rest:

- **Measurement** — add: `unit_system` (metric/imperial), field validators (sane min/max), `body_fat_pct` (optional input or derived), computed `bmi` (property), `created_at`. Photo → generate a thumbnail on save.
- **Goal** — make measurable: `metric` (which field), `target_value`, `direction` (increase/decrease/reach), `target_date`, `is_completed`. Progress auto-derived by comparing latest measurement to target. Keep free-text `description` as a note.
- **TrainingPlan** (NEW) — `trainer`, `trainee`, `title`, `body`/structured exercises, `week`/`period`, `attachment`, `created_at`. The missing core feature.
- **Message** — keep, but serve via API; add `conversation` grouping or index on (sender, receiver, timestamp) for "since" queries.
- **AuditLog** (optional) — who viewed/edited whose data. Cheap insurance for a health-data app.

---

## 6. Feature set for the rebuild (candidate epics/features)

Ordered by value. Each is a candidate feature ticket.

### Epic A — Foundation & auth (must ship first)
- A1. Project scaffold: DRF, settings split (dev/prod), CI with test gate, `.gitignore` fixes (drop db + media from repo).
- A2. Custom user + roles + the single `can_access` predicate.
- A3. DRF permission classes built on `can_access`; **full permission test matrix**.
- A4. Auth endpoints: login, logout, token/JWT, password set for trainer-created accounts.

### Epic B — Measurements (the core loop)
- B1. Measurement CRUD API with validation + units.
- B2. Photo upload to Blob + thumbnail generation + delete-on-delete lifecycle.
- B3. Trend/chart data endpoint (server-computed series per metric).
- B4. Derived metrics service: BMI, body-fat estimate, per-metric deltas & trend direction.

### Epic C — Mobile-first capture (where data is born)
- C1. PWA shell, installable, responsive.
- C2. Fast measurement entry form (phone-optimized, camera capture).
- C3. Offline queue: capture works without signal, syncs later.
- C4. Reminders / push: "log your weekly measurement."

### Epic D — Photo progress
- D1. Photo comparison UI: date-aligned, side-by-side.
- D2. Overlay/slider compare + optional pose guide for consistent shots.

### Epic E — Coaching loop
- E1. TrainingPlan model + trainer create/assign + trainee view.
- E2. Measurable goals + auto-progress from measurements.
- E3. Goal/plan notifications to trainee.

### Epic F — Communication
- F1. Chat API (fetch-since-timestamp, mark-read once).
- F2. Realtime (SSE/WebSocket) upgrade.

### Epic G — Trainer cockpit
- G1. Trainee roster with at-a-glance progress (last measurement, trend arrows, overdue flags).
- G2. Assistant-trainer management.
- G3. Optional audit log view.

---

## 7. Non-functional requirements

- **Security:** health/body data — enforce HTTPS (already), least-privilege access, no data leak across trainers (test-enforced), secure media URLs (Blob random suffix already helps), rate-limit auth.
- **Testing:** permission matrix + measurement validation + API contract tests gate CI. Target meaningful coverage on `permissions.py` and `services/`.
- **Performance:** `select_related`/`prefetch_related` on roster and access checks; paginate lists; index message + measurement lookups.
- **Data lifecycle:** blob cleanup on delete; export/delete-my-data path (privacy).
- **i18n:** UI is Slovak today — keep translatable; don't hardcode strings in the SPA.
- **Observability:** structured logging, error tracking (Sentry already referenced in tooling).

---

## 8. Migration / cutover notes

- Existing data is trivial (dev SQLite + 2 media files) — treat as greenfield; no heavy migration.
- Reuse the Vercel Blob backend nearly as-is; add thumbnail + delete.
- Reuse `CustomUser` shape; add fields via migration.
- The existing `tasks/plans/epic-vercel-mobile-rewrite.md` already points at the mobile rewrite — fold that into Epic C.

---

## 9. Suggested build order (dependency-aware)

```
A (foundation) ──► B (measurements) ──► C (mobile capture)
                          │
                          ├──► D (photo compare)
                          └──► B4 metrics ──► E2 measurable goals
E1 plans ──► F chat ──► G cockpit  (can parallelize after A+B)
```

Ship A+B first — that alone is a testable, secure, deployable core. Everything else layers on.

---

## 10. Definition of "better" (acceptance for the rebuild as a whole)

- Zero duplicated views; one authorization predicate; permission test matrix green in CI.
- No data files in git; prod verified on Postgres + Blob.
- Trainee can log a measurement + photo from a phone in under 30 seconds, offline-tolerant.
- Trainer sees a roster with trend arrows and overdue flags without opening each trainee.
- Goals are measurable and auto-progress; training plans exist and are deliverable.
- Photo compare supports overlay/slider, date-aligned.
