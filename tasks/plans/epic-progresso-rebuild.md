# Epic: Progresso App — Grand Rebuild

**Slug:** progresso-rebuild
**App name:** Progresso (formerly "Trener")
**Source:** `tasks/design/rebuild-analysis.md`, `tasks/design/design-system.md`, `tasks/design/mvp-routes.md`, `tasks/design/design-preview.html`
**Plans:** P1–P8 (8)
**Author:** Claude (Opus)
**Date:** 2026-08-11
**Status:** Approved

> Design docs use the old name "Trener"; the app is now **Progresso**. Where a doc says "Trener app",
> read "Progresso". Quoted ACs keep the doc's original wording.

> No GitHub tickets exist. This epic is derived entirely from the three design documents in
> `tasks/design/`. Acceptance criteria below are quoted from those docs (file + section), not from
> issues. Repo is effectively greenfield (no `core/`, no `CLAUDE.md`); treat as a from-scratch build.

---

## 1. Why this epic exists

Progresso is a remote personal-training platform. A trainer coaches trainees at a distance; the core
loop is *trainee logs body measurements + progress photo → trainer reviews trends and photo compare →
they talk* (`rebuild-analysis.md` §1). The measurement + photo history is the heart of the product.

The current build is not worth patching: `views.py` defines every view twice, authorization logic is
copy-pasted 8+ times with subtle drift (cross-trainer data-leak risk), there are zero tests, and
`db.sqlite3` + `media/` are committed to git (`rebuild-analysis.md` §2). The decision is a structured
rebuild — reuse the domain, replace the architecture (§2 conclusion).

The rebuild ships an API-first Django + DRF backend with **one authorization predicate** (single source
of access truth, manually verified — no test suite this project), a
mobile-first PWA for capture, and the "instrument-panel" visual identity (deep-navy, cyan accent,
Orbitron / Inter / JetBrains Mono) from the sister sites (`design-system.md`). MVP is the core loop
only; training plans, offline queue, push, realtime chat, derived body-fat, assistant-trainer mgmt,
and audit log are explicitly post-MVP (`mvp-routes.md` §scope).

---

## 2. Plans in this epic

| ID | Plan | Delivers | Depends on |
|----|------|----------|------------|
| P1 | Foundation & Auth | DRF scaffold, settings split, `.gitignore` fix, `CustomUser` + roles, single `can_access` predicate, DRF permission classes, auth endpoints | none |
| P2 | Measurements Core API | Measurement model (units + validators), CRUD viewset, list/detail/create/patch/delete through `can_access` | P1 |
| P3 | Media, Photos & Blob Lifecycle | Vercel Blob backend reused, thumbnail-on-save, delete-on-delete, photo-compare list endpoint | P2 |
| P4 | Derived Metrics & Chart Data | metrics service (BMI, deltas, trend direction), `measurements/series` chart endpoint | P2 |
| P5 | Design System, PWA Shell & i18n | React+Tailwind tokens (light/dark), Orbitron/Inter/JetBrains Mono, PWA shell, router, auth screens, theme toggle, EN↔SK i18n layer | P1 (API for auth) |
| P6 | Trainee Journey | `/me` home, measurements list/detail, **mobile capture form**, progress charts, goals list+add | P2, P3, P4, P5 |
| P7 | Trainer Cockpit | roster w/ overdue flags, add-trainee, trainee overview, their measurements/progress, **photo compare UI**, goal toggle | P2, P3, P4, P5 |
| P8 | Chat + Hardening & Deploy | messages API (fetch-since, mark-read once), chat screens, security/perf/data-lifecycle NFRs, Postgres+Blob prod verify | P1–P7 |

---

## 3. Cross-cutting decisions (decide once, all plans respect)

**Locked decisions (from developer, 2026-08-11):**
- **Frontend = React + Tailwind.** Design tokens map into `tailwind.config`; utilities resolve to brand.
- **Auth = session-based, simple but secure.** Django session auth over HTTPS, CSRF-protected, secure +
  httpOnly cookies. No JWT in MVP. (Overrides the "JWT for mobile" note in `rebuild-analysis.md` §4.)
- **Thumbnails generated on save** with Pillow, before Blob upload (serverless FS is ephemeral).
- **Themes = light + dark only** for MVP. `deep` (OLED) not built.
- **Deploy = Vercel, but host-agnostic.** No Vercel-only lock-in beyond the Blob backend; keep DB, media,
  and runtime portable so a container host is a config swap if the app grows users.
- **No automated testing, no CI test gate, no Sentry.** Developer decision (2026-08-11): this project
  ships without a test suite, CI gate, or error-tracking service. The `can_access` predicate is therefore
  **manually verified**, not test-enforced — accepted risk. Design docs' "permission test matrix" and
  "CI test gate" (`rebuild-analysis.md` §6 A1/A3, §7, §10; `mvp-routes.md` §C) are **dropped** for this
  build. Keep `can_access` as a single predicate anyway so it stays auditable by eye.
- **Full EN↔SK i18n is a first-class requirement** — see below.

- **i18n from day one (EN base, SK translation, easily switchable).** Every user-facing string in the
  React app goes through an i18n layer (e.g. `react-i18next`) with `en` and `sk` message catalogs — no
  hardcoded strings in components (`rebuild-analysis.md` §7 i18n). English is the base locale; Slovak is a
  complete parallel catalog. Language is user-switchable and persisted. Backend: any API-returned
  human-readable text (validation messages, errors) must be translatable too — return codes/keys the
  frontend localizes, or use Django's `gettext`. Dates/numbers format per locale (JetBrains Mono still for
  the digits). Adding a third language later must be catalog-only, no code change.

- **One authorization predicate.** `user.can_access(target_user)` on the user model is the *single*
  source of access truth; every DRF permission class consumes it. No inline `if role` checks anywhere
  (`rebuild-analysis.md` §4 "The one authorization rule"). Rules:
  trainee → self only; trainer → own trainees (head) + helper-assigned (helper is **post-MVP**, but the
  predicate is designed to hold it); admin → all.
- **API-first.** All app data flows through DRF JSON at `/api/v1/`; no HTML-partial polling. Admin stays
  in Django `/admin/`, outside the SPA (`mvp-routes.md` §Actors, §B).
- **Layered layout** replaces the monolith (`rebuild-analysis.md` §4):
  ```
  core/
    models/     measurement.py, goal.py, message.py, user.py  (plan.py post-MVP)
    api/        serializers.py, views.py (thin viewsets), permissions.py  <-- single access truth
    services/   chart_data.py, metrics.py, blob_cleanup.py
  ```
  (No `tests/` package — this project ships without an automated test suite.)
- **Auth:** session/token for web, JWT for mobile/PWA (`rebuild-analysis.md` §4 Stack).
- **Design tokens are the single source.** All colors/type/shape as CSS custom properties on
  `:root` (light), `[data-theme="dark"]`, `[data-theme="deep"]`. Never hardcode a hex in a component;
  if React+Tailwind, map tokens into `tailwind.config` (`design-system.md` §7).
- **Numbers are mono.** Every measurement value, weight, and date renders in JetBrains Mono; headings
  and hero stat numbers in Orbitron; all other UI in Inter (`design-system.md` §3).
- **No data files in git.** `db.sqlite3` and `media/` removed and gitignored; SQLite local-dev only,
  Postgres in prod (`rebuild-analysis.md` §2 #4, §4 DB).
- **Host-agnostic by design.** Config via env vars (`DATABASE_URL`, Blob token, secret key); nothing
  Vercel-specific in app code except the pluggable Blob storage backend. Runs the same on a container
  host — moving hosts is env + deploy config only, not a rewrite.

---

## 4. Shared data model (rebuilt)

Keep `CustomUser` shape (role, head_trainer, helpers); fix/extend the rest (`rebuild-analysis.md` §5).

| Model | Change | Introduced by | Consumed by |
|-------|--------|---------------|-------------|
| `CustomUser` | reuse role/head_trainer/helpers; host `can_access()` | P1 | all |
| `Measurement` | `unit_system`, field validators (sane min/max), `body_fat_pct` (opt), `bmi` property, `created_at`, photo→thumbnail | P2 (fields), P3 (photo/thumb), P4 (bmi/derived) | P4, P6, P7 |
| `Goal` | measurable: `metric`, `target_value`, `direction`, `target_date`, `is_completed`, `description` note | P6/P7 (MVP: basic add + toggle-complete) | P6, P7 |
| `Message` | serve via API; index `(sender, receiver, timestamp)` for `since` queries | P8 | P8 |
| `TrainingPlan` | NEW model — **post-MVP** (`mvp-routes.md` §scope), not built in P1–P8 MVP | — | — |
| `AuditLog` | optional, post-MVP | — | — |

---

## 5. Route / permission surface (the whole point)

Full MVP route + endpoint tables live in `mvp-routes.md` §A/§B. Every non-auth endpoint runs through
`can_access`. Route-level rules (`mvp-routes.md` §C):

- **trainee** → only rows where `user == self`; cannot pass another `user` id.
- **trainer** → only trainees where `head_trainer == self` (helper access post-MVP).
- **create measurement/goal** → trainee only, always `user = self`.
- **create trainee / roster** → trainer only.
- **chat** → both parties must be in an allowed trainer↔trainee relationship.
- **admin** → Django `/admin/` only.

**Permission matrix — manual verification checklist** (no automated tests this project). The
`can_access` predicate must yield, for `{trainee, trainer, other-trainer} × {own data, other's data}`,
the expected `{200, 403}` across measurements, goals, photos, chat (`mvp-routes.md` §C). Verify by hand
per plan that adds endpoints; the single predicate keeps this auditable by eye.

---

## 6. Implementation order

Dependency-aware (`rebuild-analysis.md` §9): **A→B→C** with D and metrics branching off B.

```
P1 Foundation ─► P2 Measurements ─┬─► P3 Media/Photos ─┐
                                   ├─► P4 Metrics/Charts ┤
P5 Design/Shell (after P1 auth) ───┘                     ├─► P6 Trainee ─┐
                                                          └─► P7 Trainer ─┴─► P8 Chat + Hardening
```

Ship P1+P2 first — that alone is a secure, deployable core (`rebuild-analysis.md` §9). P5 can
start in parallel once P1 exposes `/auth`. P6 and P7 can parallelize after P2–P5 land. P8 closes the loop
and does prod hardening.

---

## 7. Multi-role considerations

- App is **role-scoped, not multi-tenant council-style** — the tenancy boundary is the trainer↔trainee
  relationship. Never assume trainee-only or trainer-only behavior generalizes; the `can_access`
  predicate is the only place that resolves it.
- Trainee cannot reach any `/trainer/*` route; trainer cannot create measurements. Enforced by the API,
  not just the UI (`mvp-routes.md` §A note, §C).
- Helper/assistant-trainer is post-MVP but the predicate must be shaped to admit it without a rewrite.

---

## 8. Open questions (epic-wide) — all resolved 2026-08-11

- [x] Q1: Frontend → **React + Tailwind**, tokens mapped into `tailwind.config`.
- [x] Q2: Auth → **session-based, simple but secure** (HTTPS, CSRF, secure httpOnly cookies). No JWT in MVP.
- [x] Q3: Thumbnails → **Pillow on save, before Blob upload**.
- [x] Q4: Themes → **light + dark only**; no `deep`.
- [x] Q5: Deploy → **Vercel, host-agnostic** (env-driven config, portable to a container host later).
- [x] Q6 (new): **Full EN↔SK i18n, first-class** — EN base + SK catalog, no hardcoded strings, user-switchable.

---

## 9. Per-plan briefs

### P1 — Foundation & Auth
- **Delivers:** the skeleton everything hangs off — DRF project, dev/prod settings split,
  `.gitignore` fixed (db + media out of repo), `CustomUser` + roles, the single
  `can_access` predicate, DRF permission classes built on it, and auth endpoints.
  (No CI test gate, no test suite — this project ships without automated testing.)
- **Acceptance (from design docs):**
  - "Project scaffold: DRF, settings split (dev/prod), `.gitignore` fixes (drop db +
    media from repo)." (`rebuild-analysis.md` §6 A1) — **CI test gate dropped** (developer decision).
  - "Custom user + roles + the single `can_access` predicate." (§6 A2)
  - "DRF permission classes built on `can_access`." (§6 A3) — **permission test matrix dropped**;
    verify the access rules manually (see §5 checklist).
  - "Auth endpoints: login, logout, token/JWT, password set for trainer-created accounts." (§6 A4) —
    **MVP uses session auth only** (Q2): HTTPS, CSRF protection, secure + httpOnly session cookies; no JWT.
  - Endpoints: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
    (`mvp-routes.md` §B Auth).
  - "Zero duplicated views; one authorization predicate" (permission verified manually, not in CI). + "No data
    files in git." (`rebuild-analysis.md` §10)
- **Files / areas:** `core/models/user.py`, `core/api/permissions.py`,
  settings split, `.gitignore`.
  - Env-driven config (`DATABASE_URL`, Blob token, `SECRET_KEY`) so the app is host-agnostic (Q5).
- **Depends on:** none.
- **Conventions:** layered layout §3; `can_access` is the only access authority; session auth (Q2).
- **Out of scope:** any domain endpoint beyond auth; JWT (post-MVP); helper access (post-MVP but predicate shaped for it).

### P2 — Measurements Core API
- **Delivers:** the Measurement model with units + range validation and the CRUD API — the core loop's
  data spine.
- **Acceptance:**
  - "Measurement CRUD API with validation + units." (`rebuild-analysis.md` §6 B1)
  - Model adds "`unit_system` (metric/imperial), field validators (sane min/max) … `created_at`."
    (§5 Measurement)
  - "**No units, no range validation** on measurements … Garbage data (5000 kg) accepted." — must be
    fixed (§2 #8).
  - Endpoints (`mvp-routes.md` §B Measurements): `GET /api/v1/measurements?user=:id`,
    `POST /api/v1/measurements` (trainee, multipart), `GET/PATCH/DELETE /api/v1/measurements/:id`.
  - Permission rules per `mvp-routes.md` §C: trainee self-only, create always `user=self`, trainer read
    own trainees.
- **Files / areas:** `core/models/measurement.py`, `core/api/serializers.py`, `core/api/views.py`.
- **Depends on:** P1.
- **Conventions:** thin viewsets, all access via `can_access`; numeric fields validated min/max.
- **Out of scope:** photo bytes/thumbnails (P3), derived BMI/series (P4).

### P3 — Media, Photos & Blob Lifecycle
- **Delivers:** progress-photo handling done right — reuse the Vercel Blob backend, generate a thumbnail,
  and wire delete-on-delete so blobs don't leak. Plus the photo-compare list endpoint.
- **Acceptance:**
  - "Photo upload to Blob + thumbnail generation + delete-on-delete lifecycle." (`rebuild-analysis.md`
    §6 B2)
  - "Photo → generate a thumbnail on save." (§5 Measurement)
  - "**Blob delete never wired** to measurement deletion. Orphaned blobs → storage leak + cost." — fix
    (§2 #9).
  - "Reuse the Vercel Blob backend nearly as-is; add thumbnail + delete." (§8)
  - Endpoint: `GET /api/v1/measurements/photos?user=:id` — measurements that have a photo, for the
    compare picker; photo bytes served from Blob public URL in the payload, no proxy (`mvp-routes.md` §B
    Photos).
- **Files / areas:** `core/services/blob_cleanup.py`, Blob storage backend, `measurement.py` save hook,
  serializer photo/thumbnail fields.
- **Depends on:** P2.
- **Conventions:** deletion (measurement delete + trainee delete cascade, `mvp-routes.md` §B Users)
  must clean blobs.
- **Out of scope:** overlay/slider compare UI (P7 / post-MVP), pose guide (post-MVP).

### P4 — Derived Metrics & Chart Data
- **Delivers:** compute insight from the numbers already collected — a metrics service and the chart
  series endpoint.
- **Acceptance:**
  - "Trend/chart data endpoint (server-computed series per metric)." (`rebuild-analysis.md` §6 B3)
  - "Derived metrics service: BMI, body-fat estimate, per-metric deltas & trend direction." (§6 B4) —
    note body-fat is post-MVP per `mvp-routes.md`; BMI/deltas/trend are MVP.
  - "computed `bmi` (property)" on Measurement (§5).
  - Endpoint: `GET /api/v1/measurements/series?user=:id` → "chart series: dates + per-metric arrays"
    (`mvp-routes.md` §B Measurements).
- **Files / areas:** `core/services/metrics.py`, `core/services/chart_data.py`, `measurement.py` bmi
  property, series serializer.
- **Depends on:** P2.
- **Conventions:** compute server-side; series shaped for Chart.js consumption (`design-system.md` §5
  Charts).
- **Out of scope:** body-fat derivation (post-MVP), measurable-goal auto-progress (that reads these but
  ships with goals in P6/P7).

### P5 — Design System, PWA Shell & i18n
- **Delivers:** the visual identity as Tailwind-mapped tokens, the installable React PWA shell, the SPA
  router, auth screens, the light/dark theme toggle, and the **EN↔SK i18n layer** — the frame P6/P7 build
  inside. Stack = React + Tailwind (Q1); themes light + dark only (Q4).
- **Acceptance:**
  - "PWA shell, installable, responsive." (`rebuild-analysis.md` §6 C1)
  - "'Instrument-panel' aesthetic: deep-navy surfaces, cyan `#00aaff` accent with dark-mode glow,
    Orbitron headings, Inter UI, JetBrains Mono for every number. Rounded cards (12–20px), soft navy
    shadows, mobile-first, light + dark themes tokenized as CSS variables." (`design-system.md` §8)
  - Tokens on `:root`/`[data-theme="dark"]`/`[data-theme="deep"]`; single token source; no hardcoded
    hex (`design-system.md` §7). Load Orbitron/Inter/JetBrains Mono from Google Fonts (§3).
  - "respect `prefers-color-scheme` and offer a manual toggle." (`design-system.md` §6)
  - Shared/auth screens: `/login`, `/logout`, `/` role-redirect (`mvp-routes.md` §A Shared/auth);
    frontend bootstraps from `GET /api/v1/auth/me`.
  - Accessibility: reserve accent for interactive/large; navy `--text`/`--heading` for body
    (`design-system.md` §7).
  - **i18n:** `react-i18next` (or equiv) with `en` + `sk` catalogs; EN base, SK complete; language
    switcher in the shell, persisted; zero hardcoded UI strings; locale-aware date/number formatting;
    third language = catalog-only later (`rebuild-analysis.md` §7 i18n).
- **Files / areas:** token→`tailwind.config` map, PWA manifest + service worker shell, React router,
  login screen, theme toggle, `locales/en.json` + `locales/sk.json`, i18n init + language switcher.
  Reference `tasks/design/design-preview.html` for the intended look.
- **Depends on:** P1 (needs `/auth`).
- **Conventions:** design-system.md §5 component patterns (buttons, cards, stat tile, inputs, tables,
  pills, avatars); tokens are single source, no hardcoded hex; all strings via i18n keys.
- **Out of scope:** offline capture queue (post-MVP, C3), push/reminders (post-MVP, C4), `deep`/OLED theme
  (Q4: light+dark only).

### P6 — Trainee Journey
- **Delivers:** everything a trainee navigates — home, measurement list/detail, the mobile-first capture
  form (numbers + photo), progress charts, and goals.
- **Acceptance:**
  - Screens (`mvp-routes.md` §A Trainee): `/me` (latest measurement, trend snapshot, "log this week"),
    `/me/measurements`, `/me/measurements/new` (**core capture form: numbers + photo, mobile-first**),
    `/me/measurements/:id`, `/me/progress` (charts), `/me/goals` (list + add), `/me/chat` (P8).
  - "Fast measurement entry form (phone-optimized, camera capture)." (`rebuild-analysis.md` §6 C2)
  - "Trainee can log a measurement + photo from a phone in under 30 seconds." (§10) — offline-tolerant
    part is post-MVP.
  - Goals MVP: `GET /api/v1/goals?user=:id`, `POST /api/v1/goals` (trainee adds own) (`mvp-routes.md` §B
    Goals).
  - Capture form uses JetBrains Mono numeric inputs, bottom action bar for primary CTA
    (`design-system.md` §5, §6).
- **Files / areas:** trainee routes/screens, capture form, charts (Chart.js against P4 series), goals
  UI, consuming P2/P3/P4 APIs inside the P5 shell.
- **Depends on:** P2, P3, P4, P5.
- **Conventions:** mobile-first single-column, thumb-reachable (`design-system.md` §6); stat tile for
  hero metric (§5).
- **Out of scope:** offline queue, reminders/push (post-MVP); measurable-goal editor beyond basic add.

### P7 — Trainer Cockpit
- **Delivers:** the trainer's review surface — roster with trend/overdue at a glance, add-trainee,
  trainee overview and data, and photo compare.
- **Acceptance:**
  - Screens (`mvp-routes.md` §A Trainer): `/trainer` (roster, last-measurement date, overdue flag),
    `/trainer/trainees/new`, `/trainer/trainees/:id`, `.../measurements`, `.../progress`,
    `.../photos` (**photo compare: pick dates, side-by-side**), `.../goals` (view/toggle complete),
    `.../chat` (P8).
  - "Trainee roster with at-a-glance progress (last measurement, trend arrows, overdue flags)."
    (`rebuild-analysis.md` §6 G1)
  - "Trainer sees a roster with trend arrows and overdue flags without opening each trainee." (§10)
  - "Photo comparison UI: date-aligned, side-by-side." (§6 D1)
  - Roster/trainee APIs: `GET/POST /api/v1/trainees`, `GET/PATCH/DELETE /api/v1/trainees/:id`
    (`mvp-routes.md` §B Users); goal toggle-complete via `PATCH /api/v1/goals/:id` (§B Goals).
- **Files / areas:** trainer routes/screens, roster cards (design-system.md §6 responsive grid),
  add-trainee form, photo-compare picker (consumes P3 photos endpoint), goals toggle.
- **Depends on:** P2, P3, P4, P5.
- **Conventions:** roster items are cards with trend arrows + overdue pill (`design-system.md` §5 pills,
  §6 grid); enforce trainer-only at API not just UI.
- **Out of scope:** overlay/slider + pose guide (D2, post-MVP), assistant-trainer management (G2,
  post-MVP), audit log view (G3, post-MVP).

### P8 — Chat + Hardening & Deploy
- **Delivers:** the conversation feature done as a real API (no HTML polling), the chat screens for both
  sides, and the non-functional hardening + prod verification that makes the MVP shippable.
- **Acceptance:**
  - "Chat API (fetch-since-timestamp, mark-read once)." (`rebuild-analysis.md` §6 F1) — replaces the
    "HTML-partial polling" hack (§2 #5).
  - Endpoints (`mvp-routes.md` §B Chat): `GET /api/v1/messages?with=:userId&since=:ts`,
    `POST /api/v1/messages`, `POST /api/v1/messages/read` (mark read once, not every poll).
  - Message model: index `(sender, receiver, timestamp)` for `since` queries (§5 Message).
  - Chat screens `/me/chat` and `/trainer/trainees/:id/chat` (`mvp-routes.md` §A).
  - NFRs (`rebuild-analysis.md` §7): least-privilege access (no cross-trainer leak, **manually
    verified — no test suite**), rate-limit auth, `select_related`/`prefetch_related` on roster + access
    checks, paginate lists, index message + measurement lookups, blob cleanup on delete,
    export/delete-my-data path, i18n (**EN↔SK complete, no hardcoded SPA strings, backend messages
    translatable** — Q6), plain Django logging (**Sentry dropped** — developer decision).
  - "No data files in git; prod verified on Postgres + Blob." (§10)
  - **Host-agnostic deploy verified** (Q5): all config env-driven, no Vercel lock-in beyond the pluggable
    Blob backend; documented path to move to a container host.
- **Files / areas:** `core/models/message.py`, messages viewset/serializer, chat screens, rate-limit
  config, query-optimization pass, deploy config.
- **Depends on:** P1–P7.
- **Conventions:** fetch-since only (never full re-fetch); mark-read once; permission via `can_access`
  (both parties in allowed relationship).
- **Out of scope:** realtime SSE/WebSocket upgrade (F2, post-MVP); training plans (E1), measurable-goal
  auto-progress + notifications (E2/E3) — all post-MVP.

---

## 10. Definition of "better" (epic-wide acceptance, `rebuild-analysis.md` §10)

- Zero duplicated views; one authorization predicate, manually verified (no test matrix / CI this project).
- No data files in git; prod verified on Postgres + Blob.
- Trainee logs measurement + photo from a phone in under 30s (offline-tolerant = post-MVP).
- Trainer sees roster with trend arrows + overdue flags without opening each trainee.
- Goals measurable + auto-progress and training plans deliverable = the coaching-loop target; MVP ships
  basic goals, the measurable/plan work is post-MVP (`mvp-routes.md` §scope).
- Photo compare supports side-by-side date-aligned in MVP; overlay/slider post-MVP.
