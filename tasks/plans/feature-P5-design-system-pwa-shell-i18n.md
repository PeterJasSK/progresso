# Feature Plan: P5 — Design System, PWA Shell & i18n

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved)
**Plan ID:** P5
**Slug:** design-system-pwa-shell-i18n
**Author:** Claude (Opus)
**Date:** 2026-08-11
**Status:** Complete (2026-08-11; all §11 defaults Q1–Q7 accepted; implemented on `main` per developer)

> No GitHub issue. ACs are quoted from the design docs (`tasks/design/*.md`) via the epic §9 P5 brief.
> Frontend is **greenfield**: no `package.json`, no `frontend/`, no JS toolchain in the repo yet. This plan
> stands up the entire React + Tailwind PWA from scratch — the frame P6/P7 build their screens inside.

> **No automated tests** (epic §3 locked decision). Verification is manual only — see §7.

---

## 0. Context this plan depends on (from P1, already shipped)

P1 shipped session-based auth on `main`. P5 consumes that contract exactly as built — it does **not** change
the backend except the two small, explicitly-scoped additions in §5.7 (SPA static serving + a catch-all
route), which are flagged as an open question (§11 Q6):

- **Auth endpoints** (`core/api/urls.py`, all under `/api/v1/`):
  - `POST /auth/register` — `AllowAny`. Body `{username, password, role, trainer_id?}`; on success `201`
    `{id, username, role}` **and auto-login** (session cookie set). Errors are **translation keys** in
    `detail` (`invalid_role`, `username_taken`, `password_too_weak`, `invalid_trainer`), not English prose.
  - `GET /auth/trainers` — `AllowAny`. `[{id, display_name}]` for the signup trainer picker.
  - `POST /auth/login` — `{username, password}` → `200` `{id, username, role}` + session cookie; bad creds
    `401` `{"detail": "invalid_credentials"}` (a key).
  - `POST /auth/logout` — `204`, clears session.
  - `GET /auth/me` — `IsAuthenticated`; `200` `{id, username, role}`; **decorated `ensure_csrf_cookie`** so
    the SPA receives the `csrftoken` cookie. This is the designated SPA CSRF handshake point (P1 §8, §13).
- **Auth model:** DRF `SessionAuthentication` only (no JWT, epic Q2). CSRF is enforced on **authenticated
  unsafe** requests: after login/register the SPA must send `X-CSRFToken` (read from the `csrftoken` cookie)
  on every non-GET request. Anonymous register/login need no token. (P1 §13 verified this.)
- **`role`** ∈ `{trainee, trainer, admin, helper}`; the SPA only ever sees `trainee`/`trainer` for real users
  (admin lives in Django `/admin/`, outside the SPA).

P5 renders **no domain data** — measurements, goals, charts, roster, chat all belong to P6/P7/P8. P5 delivers
the shell, tokens, theme, i18n, and the auth screens only.

---

## 1. Goal

Deliver the frame every later screen builds inside:

- A **React + Tailwind** SPA (Vite) with the design tokens from `design-preview.html` mapped into
  `tailwind.config` and emitted as CSS custom properties — single token source, no hardcoded hex (epic Q1, §3).
- The three brand type families (Orbitron / Inter / JetBrains Mono) loaded, **self-hosted for offline PWA**
  (§11 Q3).
- An **installable, responsive PWA shell**: web manifest + a service worker that caches the app shell.
- The **SPA router** with role-aware redirect and route guards (trainee cannot reach `/trainer/*`, enforced
  UI-side here and by the API in P6/P7).
- **Auth screens** — `/login`, `/register` (open self-registration + trainer picker, per P1 §0), `/logout`
  action, and `/` role-redirect. The SPA bootstraps its session from `GET /api/v1/auth/me`.
- A **light/dark theme toggle** that respects `prefers-color-scheme`, persists the choice, and sets
  `data-theme` on `<html>` (light + dark only — epic Q4; `deep`/OLED not built).
- A first-class **EN↔SK i18n layer** (`react-i18next`): EN base + complete SK catalog, a persisted language
  switcher in the shell, **zero hardcoded UI strings**, and locale-aware date/number formatting. A third
  language later must be catalog-only (epic Q6, §3).
- A **reusable component kit** (button, card, input, stat tile, pill, avatar, theme/lang toggles) so P6/P7
  assemble screens instead of restyling — matching `design-system.md` §5 and `design-preview.html`.

---

## 2. Acceptance criteria (quoted from design docs via epic §9 P5)

- [x] **AC-1** "PWA shell, installable, responsive." — Covered by `frontend/vite.config.ts:11-46`
  (VitePWA manifest: name/short_name/theme_color `#052e44`/`display:standalone`/`start_url`/icons 192/512/maskable;
  workbox `navigateFallback:index.html` + globPatterns precache). Icons `frontend/public/icons/*`.
  Build emits `dist/sw.js` + `manifest.webmanifest` (54 precache entries, verified). Responsive/mobile-first:
  `frontend/src/components/AppShell.tsx:37,49` (`max-w-[1080px]`), placeholder grids `sm:grid-cols-2`
  (`frontend/src/pages/TraineeHomePlaceholder.tsx:24`).
- [x] **AC-2** Instrument-panel aesthetic — Covered by `frontend/src/styles/tokens.css` (navy surfaces, cyan
  `--accent:#00aaff`, dark `--glow`) + component kit `frontend/src/components/` (Button/Card/Input/StatTile/
  Pill/Avatar). Type system: Orbitron heading/hero numbers `frontend/src/components/StatTile.tsx:29`
  (`font-display`), JetBrains Mono deltas `:32` (`font-mono`), Inter body via `index.css:11`. Logo `◆ PROGRESSO`
  `frontend/src/components/AppShell.tsx:39-41`.
- [x] **AC-3** Tokens as CSS custom properties, single source, mapped to Tailwind, no hex in components —
  Covered by `frontend/src/styles/tokens.css` (`:root`/`:root[data-theme="dark"]`, no `deep`) +
  `frontend/tailwind.config.ts:14-45` (every value `var(--token)`). `grep -rE '#[0-9a-fA-F]{3,8}' src/**/*.tsx`
  → NONE (verified).
- [x] **AC-4** prefers-color-scheme + persisted manual toggle — Covered by `frontend/index.html:15-30`
  (no-flash init from localStorage/OS before paint) + `frontend/src/theme/ThemeProvider.tsx:26-38`
  (persist to localStorage, set `data-theme`) + `frontend/src/components/ThemeToggle.tsx`.
- [x] **AC-5** Shared/auth screens + guards + bootstrap — Covered by `frontend/src/App.tsx:24-63` (route table,
  `/login` `/register` `/logout` `/` `/me` `/trainer` `*`), `frontend/src/auth/AuthProvider.tsx:44-64`
  (bootstrap from `GET /auth/me`), `RequireAuth.tsx`/`RequireRole.tsx`, `RootRedirect.tsx`, `LoginPage.tsx`,
  `RegisterPage.tsx` (open self-register + trainer picker). Backend flow smoke-verified (register→me→logout).
- [x] **AC-6** Accessibility — Covered by `frontend/src/index.css:30-34` (`:focus-visible` accent ring),
  aria-labels/aria-pressed `frontend/src/components/ThemeToggle.tsx:14-15`,
  `frontend/src/components/LanguageSwitcher.tsx:16,30`, `Spinner.tsx` `role=status` + sr-only. Accent reserved
  for interactive/large; body copy uses `--text`/`--heading`.
- [x] **AC-7 (i18n)** react-i18next EN base + complete SK, persisted switcher, zero hardcoded strings, locale
  formatting, catalog-only 3rd language — Covered by `frontend/src/i18n/index.ts` (init, detector persist,
  `formatNumber`/`formatDate`, `SUPPORTED_LANGUAGES`), `en.json`/`sk.json`, `LanguageSwitcher.tsx`.
  Backend error keys mapped: `frontend/src/pages/LoginPage.tsx:41` / `RegisterPage.tsx:63`
  (`t('errors.${key}')`) against `errors.*` in both catalogs. No literal UI strings (grep verified).

### Fidelity note (token source of truth)

`design-preview.html` is the **rendered** reference and is authoritative for exact values where it and
`design-system.md` differ. Notably the preview adds `--muted`, `--danger`, `--warn` and uses dark
`--surface: #0c3350` (vs `#084666` in `design-system.md` §2). **Adopt the `design-preview.html` values**
(§5.2 lists the full set). The chart palette (`design-system.md` §2 "Semantic / chart palette") is copied
into tokens now for P4/P6 charts to consume, but **no chart is built in P5**.

---

## 3. Out of scope (deferred — do not build in P5)

- Any **domain screen or data**: `/me/*` trainee journey (P6), `/trainer/*` cockpit (P7), chat (P8). P5
  registers **placeholder** role-home routes (`/me`, `/trainer`) that render an authenticated empty shell so
  the redirect + guard are verifiable; P6/P7 replace their bodies.
- **Charts** / Chart.js wiring (P4 provides the series endpoint; P6/P7 render). P5 only ships the chart
  **color tokens**.
- **Data-fetching for domain resources** (measurements/goals/roster/messages). P5 ships only the auth API
  client + CSRF handling; P6/P7 add their own resource calls (and may add TanStack Query — see §11 Q4).
- **Offline capture queue** (post-MVP, C3) and **push/reminders** (post-MVP, C4). P5's service worker
  precaches the shell only; it does **not** queue writes.
- **`deep`/OLED theme** (epic Q4: light + dark only).
- **Production deploy wiring / Vercel config** — belongs to **P8** hardening. P5 makes the SPA dev-runnable
  (Vite dev server + proxy) and buildable; the prod static-serving decision is raised in §11 Q6 but the
  final deploy config is P8.
- Backend auth changes beyond the two SPA-serving additions in §5.7 (themselves gated on §11 Q6).

---

## 4. Cross-cutting decisions this plan adopts (from epic §3, no re-litigating)

- **React + Tailwind** (epic Q1); tokens mapped into `tailwind.config`.
- **Session auth**, CSRF-protected (epic Q2). The SPA is **same-origin** with the API (dev via Vite proxy,
  prod via same domain) so session cookies + CSRF work without `django-cors-headers` — see §5.6, §11 Q6.
- **Design tokens are the single source** — CSS custom properties, no hardcoded hex (`design-system.md` §7).
- **Numbers are mono** — JetBrains Mono for every value/date; Orbitron for headings/hero numbers; Inter for
  everything else (`design-system.md` §3).
- **i18n from day one** — no hardcoded strings; EN base + SK; user-switchable + persisted; third language
  catalog-only (epic Q6).
- **Host-agnostic** — the API base URL comes from an env var (`VITE_API_BASE`, default same-origin `/api/v1`)
  so moving hosts is config-only (epic Q5).
- **Light + dark only** (epic Q4); `deep` not built.

---

## 5. Design / approach

### 5.1 Frontend project shape (`frontend/`)

A Vite + React + TypeScript app in a top-level `frontend/` directory (kept separate from the Django app;
built assets are what prod serves). TypeScript for type safety, mirroring the backend's strict typing ethos.

```
frontend/
  index.html                     # Vite entry; sets <html lang> and initial no-flash theme script
  package.json
  vite.config.ts                 # React plugin, PWA plugin, dev proxy /api -> :8000
  tsconfig.json
  tailwind.config.ts             # tokens mapped to Tailwind theme (colors/font/radius/shadow)
  postcss.config.js
  .env.example                   # VITE_API_BASE (default /api/v1)
  public/
    icons/                        # PWA icons (192, 512, maskable) + favicon
  src/
    main.tsx                      # React root; mounts <App/>, i18n init, theme init
    App.tsx                       # <BrowserRouter> + route table + providers
    index.css                     # @tailwind layers + :root/[data-theme] token blocks + font-face
    styles/
      tokens.css                  # the single token source (:root light, [data-theme=dark])
      fonts.css                   # @font-face for Orbitron/Inter/JetBrains Mono (self-hosted)
    lib/
      api.ts                      # fetch wrapper: base URL, credentials:'include', CSRF header, key errors
      csrf.ts                     # read csrftoken cookie; ensure it (calls /auth/me)
    i18n/
      index.ts                    # react-i18next init (en base, sk, persisted language detector)
      en.json                     # English catalog (base)
      sk.json                     # Slovak catalog (complete parallel)
    theme/
      ThemeProvider.tsx           # theme state, prefers-color-scheme default, persist, set data-theme
      useTheme.ts
    auth/
      AuthProvider.tsx            # bootstraps from /auth/me; exposes user/login/register/logout
      useAuth.ts
      RequireAuth.tsx             # route guard: redirect to /login if no session
      RequireRole.tsx             # role guard: trainee blocked from /trainer/* and vice-versa
    components/
      Button.tsx  Card.tsx  Input.tsx  StatTile.tsx  Pill.tsx  Avatar.tsx
      ThemeToggle.tsx  LanguageSwitcher.tsx  AppShell.tsx  Spinner.tsx
    pages/
      LoginPage.tsx  RegisterPage.tsx  RootRedirect.tsx  NotFoundPage.tsx
      TraineeHomePlaceholder.tsx   # /me stub (P6 replaces)
      TrainerHomePlaceholder.tsx   # /trainer stub (P7 replaces)
```

### 5.2 Tokens — `src/styles/tokens.css` (single source) + `tailwind.config.ts`

Copy the **exact** values from `design-preview.html` (authoritative, §2 fidelity note). Two theme blocks only:

```css
:root, :root[data-theme="light"] {
  --bg-deep:#f8fafc; --bg:#ffffff; --surface:#eaf6ff;
  --text:#0a2540; --heading:#052e44; --muted:#5b7590;
  --accent:#00aaff; --primary:#084666; --primary-hover:#052e44;
  --border:rgba(0,170,255,0.16); --success:#0d9f6e; --danger:#dc2626; --warn:#d97706;
  --glow:none; --shadow-card:0 8px 32px rgba(8,70,102,0.12);
  --r-sm:12px; --r-md:14px; --r-lg:20px; --r-pill:30px;
  /* chart palette (consumed by P4/P6 — not rendered in P5) */
  --c-weight:#00aaff; --c-chest:#4dcfff; --c-waist:#0d9f6e;
  --c-biceps:#7ad9ff; --c-thigh:#0077cc; --c-calf:#34d399;
}
:root[data-theme="dark"] {
  --bg-deep:#052e44; --bg:#0a2540; --surface:#0c3350;
  --text:#e2e8f0; --heading:#f8fafc; --muted:#94b4cf;
  --accent:#00aaff; --primary:#00aaff; --primary-hover:#0077cc;
  --border:rgba(0,170,255,0.24); --success:#34d399; --danger:#f87171; --warn:#fbbf24;
  --glow:0 0 12px rgba(0,170,255,0.55); --shadow-card:0 8px 32px rgba(0,0,0,0.45);
}
```

`tailwind.config.ts` maps these into the theme so utilities resolve to the brand — **every mapping references
`var(--token)`, never a literal hex** (keeps the token file the one source):

```ts
theme: { extend: {
  colors: {
    bgdeep:'var(--bg-deep)', bg:'var(--bg)', surface:'var(--surface)',
    text:'var(--text)', heading:'var(--heading)', muted:'var(--muted)',
    accent:'var(--accent)', primary:'var(--primary)', 'primary-hover':'var(--primary-hover)',
    border:'var(--border)', success:'var(--success)', danger:'var(--danger)', warn:'var(--warn)',
  },
  fontFamily: { display:'var(--font-display)', sans:'var(--font-sans)', mono:'var(--font-mono)' },
  borderRadius: { sm:'var(--r-sm)', md:'var(--r-md)', lg:'var(--r-lg)', pill:'var(--r-pill)' },
  boxShadow: { card:'var(--shadow-card)', glow:'var(--glow)' },
}}
```

The font-family CSS vars live alongside the color tokens (from `design-preview.html` lines 10–12).
`darkMode: ['selector', ':root[data-theme="dark"]']` so Tailwind `dark:` variants align with our attribute
(though most theming flows through the CSS vars, not `dark:` variants — vars are the single source).

### 5.3 Fonts — self-hosted (`src/styles/fonts.css`, `@fontsource/*`)

Load Orbitron (400/600/700), Inter (400/500/700/900), JetBrains Mono (400/600) via the `@fontsource`
packages (npm), imported so Vite bundles the woff2 locally. **Self-hosted, not a CDN**, because (a) the PWA
must work offline (AC-1) and (b) `design-preview.html`'s note says the shipped app inlines the families —
a CDN would break offline and add a third-party origin. `font-display: swap`. The three CSS vars
`--font-display / --font-sans / --font-mono` (values per `design-preview.html`) select them. (§11 Q3.)

### 5.4 Theme — `src/theme/ThemeProvider.tsx`

- On init: read `localStorage["theme"]`; if absent, use `matchMedia('(prefers-color-scheme: dark)')`.
- Apply by setting `document.documentElement.setAttribute('data-theme', theme)`.
- Toggle flips light↔dark, writes localStorage, updates the attribute (AC-4).
- **No-flash:** a tiny inline script in `index.html` sets `data-theme` from localStorage/OS **before** first
  paint (prevents a light→dark flash on load), then `ThemeProvider` takes over.
- `ThemeToggle.tsx` is the pill button from `design-preview.html` (`.toggle`), with an `aria-label` and the
  label text via i18n.

### 5.5 i18n — `src/i18n/`

- `react-i18next` + `i18next-browser-languagedetector`, initialized in `src/i18n/index.ts` before render.
- Catalogs `en.json` (base) and `sk.json` (complete). Namespaced keys (`auth.login.title`, `common.save`,
  `nav.progress`, `errors.invalid_credentials`, …). **No component holds a literal user-facing string** —
  all via `t('key')` (AC-7).
- Language detector order: localStorage → `navigator.language`; fallback `en`. `LanguageSwitcher.tsx`
  (EN/SK) calls `i18n.changeLanguage` and **persists** to localStorage; also updates `<html lang>`.
- **Backend error keys** returned by P1 auth (`invalid_credentials`, `username_taken`, `password_too_weak`,
  `invalid_trainer`, `invalid_role`) map to `errors.*` keys so auth failures localize (AC-7). Unknown keys
  fall back to a generic `errors.unknown`.
- **Locale formatting:** a `formatDate` / `formatNumber` helper using `Intl.DateTimeFormat` /
  `Intl.NumberFormat` keyed off the active locale. Values still render in JetBrains Mono via the `font-mono`
  utility (formatting ≠ font). Adding a third language = drop a `xx.json` + list it in the init array —
  no code change (AC-7).

### 5.6 API client + CSRF — `src/lib/api.ts`, `src/lib/csrf.ts`

- Base URL from `import.meta.env.VITE_API_BASE` (default `/api/v1`), so **same-origin** (host-agnostic, §4).
- Every request uses `credentials: 'include'` (send the session cookie).
- **CSRF (P1 §13 contract):** anonymous `login`/`register` need no token. For authenticated unsafe requests,
  read the `csrftoken` cookie and send it as the `X-CSRFToken` header. On app start (and before the first
  unsafe request when the cookie is missing) call `GET /auth/me`, which is `ensure_csrf_cookie`-decorated
  and seeds the cookie. `csrf.ts` holds `getCookie('csrftoken')` + an `ensureCsrf()` that GETs `/auth/me`.
- Response handling: non-2xx → throw an error carrying the backend `detail` **key** so callers map it through
  i18n `errors.*`. No English strings baked into the client.
- **Dev proxy:** `vite.config.ts` proxies `/api` → `http://localhost:8000` so the browser sees one origin in
  dev (session cookie + CSRF work without CORS). Prod is same-domain too — see §11 Q6.

### 5.7 Backend touch points (small, gated on §11 Q6)

P5 is almost entirely frontend, but two backend items make the SPA servable **same-origin** in production
(so session/CSRF work without CORS). These are **proposed** and gated on Q6; if the developer prefers a
separate SPA host + CORS, this subsection is dropped and `django-cors-headers` is added instead.

- Serve the built SPA (`frontend/dist`) as static + an `index.html` catch-all for client-side routes that
  aren't `/api/*` or `/admin/*` or `/static/*`. Options: a WhiteNoise static mount + a template view, or
  Vercel routing. **Minimal Django change**, no business logic in the view (it only returns `index.html`).
- Keep `/admin/` and `/api/v1/` mounted **before** the catch-all so they win.

If Q6 picks the separate-host route, add `django-cors-headers` with `CORS_ALLOW_CREDENTIALS = True`,
`CSRF_TRUSTED_ORIGINS`, and `SESSION_COOKIE_SAMESITE='None'` (prod) instead. **Default proposal: same-origin,
no CORS** (simpler, more secure, aligns with P1's CSRF handshake).

### 5.8 Components (`src/components/`) — the reusable kit

Each mirrors `design-preview.html` / `design-system.md` §5, styled **only** via token-backed Tailwind
utilities (no inline hex):

- `Button` — `primary` (filled `--primary`, white text, hover `--primary-hover` + `--glow` on dark) and
  `ghost` (transparent, `--border`, accent text); `radius-sm`, Inter 500, visible focus ring.
- `Card` — `--bg` fill, `1px --border`, `radius-md`, `shadow-card`.
- `Input` — `--surface` fill, `--border`, `radius-sm`, accent focus ring (+glow dark); numeric variant uses
  `font-mono` + `inputmode="decimal"` (the capture form in P6 reuses this).
- `StatTile` — big Orbitron number + Inter label + JetBrains Mono delta (green/red/muted via
  success/danger/muted). Rendered on the placeholder homes to prove the token+type system end-to-end.
- `Pill` — `radius-pill`, accent-tinted bg, accent text; `warn`/`ok` variants (`design-preview.html` `.pill`).
- `Avatar` — circle, gradient fill, thin accent ring, initials in Orbitron.
- `AppShell` — topbar (logo `◆ PROGRESSO`, `ThemeToggle`, `LanguageSwitcher`, logout), max-width ~1080px,
  mobile-first, bottom action bar slot for P6's primary CTA. All labels via i18n.
- `Spinner` — used while `/auth/me` bootstrap is in flight.

> **Name:** the logo reads **PROGRESSO** (not "TRENER" as in the old `design-preview.html`) — the app was
> renamed (epic header). All screen chrome uses "Progresso".

### 5.9 Routing & guards — `src/App.tsx`

`react-router-dom` v6. Table:

| Path | Element | Guard |
|------|---------|-------|
| `/login` | `LoginPage` | redirect to role home if already authed |
| `/register` | `RegisterPage` | redirect to role home if already authed |
| `/logout` | action → `AuthProvider.logout()` → `/login` | — |
| `/` | `RootRedirect` | → `/me` (trainee) / `/trainer` (trainer) / `/login` (anon) |
| `/me` | `TraineeHomePlaceholder` | `RequireAuth` + `RequireRole('trainee')` |
| `/trainer` | `TrainerHomePlaceholder` | `RequireAuth` + `RequireRole('trainer')` |
| `*` | `NotFoundPage` | — |

`RequireRole` enforces trainee-cannot-reach-`/trainer/*` **in the UI** (`mvp-routes.md` §A note); the **API**
enforces it authoritatively in P6/P7 via `can_access`. `AuthProvider` bootstraps once from `GET /auth/me`
(showing `Spinner` until resolved), so guards have the user before deciding.

### 5.10 Auth screens

- `LoginPage` — username + password (token-styled `Input`s), submit → `POST /auth/login`; on `200` set user
  and redirect to role home; on `401` show the localized `errors.invalid_credentials`. Link to `/register`.
  All strings via i18n.
- `RegisterPage` (open self-registration, P1 §0) — username, password, a **role choice** (trainee/trainer),
  and — when role is trainee — a **trainer picker** populated from `GET /auth/trainers` (optional/blank
  allowed). Submit → `POST /auth/register`; on `201` the user is auto-logged-in → redirect to role home; map
  `400` error keys (`username_taken`, `password_too_weak`, `invalid_trainer`) through i18n. Strings via i18n.
- `RootRedirect` / `/logout` as in §5.9.

### 5.11 PWA — manifest + service worker

- Use `vite-plugin-pwa` (Workbox) for a generated service worker that **precaches the built shell** and
  serves `index.html` offline (AC-1). `registerType: 'autoUpdate'`.
- `manifest`: `name: "Progresso"`, `short_name: "Progresso"`, `theme_color` = `#052e44` (deep navy),
  `background_color`, `display: "standalone"`, `start_url: "/"`, icons 192/512 + a maskable icon
  (`public/icons/`).
- **No write-queueing / background sync** — offline capture is post-MVP (§3). The SW caches the shell + static
  assets only; API calls still require the network.

---

## 6. File Plan

All new files unless noted. Frontend is TypeScript/TSX; strict mode on in `tsconfig.json`. No hardcoded hex
in any `.tsx` — colors come from token-backed Tailwind utilities. No user-facing string literal outside the
i18n catalogs.

| File | Change | Notes |
|------|--------|-------|
| `frontend/package.json` | new | react, react-dom, react-router-dom, i18next, react-i18next, i18next-browser-languagedetector, @fontsource/{orbitron,inter,jetbrains-mono}, tailwindcss, postcss, autoprefixer, vite, @vitejs/plugin-react, vite-plugin-pwa, typescript |
| `frontend/index.html` | new | Vite entry; `<html lang>`; inline no-flash theme script (§5.4) |
| `frontend/vite.config.ts` | new | react + PWA plugins; dev proxy `/api` → `:8000` (§5.6, §5.11) |
| `frontend/tsconfig.json` | new | strict TS |
| `frontend/postcss.config.js` | new | tailwind + autoprefixer |
| `frontend/tailwind.config.ts` | new | tokens → theme, all `var(--token)` (§5.2) |
| `frontend/.env.example` | new | `VITE_API_BASE=/api/v1` (host-agnostic, Q5) |
| `frontend/public/icons/*` | new | PWA icons 192/512/maskable + favicon |
| `frontend/src/main.tsx` | new | root; i18n + theme init before render |
| `frontend/src/App.tsx` | new | router + providers + route table (§5.9) |
| `frontend/src/index.css` | new | `@tailwind` layers; imports tokens.css + fonts.css |
| `frontend/src/styles/tokens.css` | new | single token source, `:root` + `[data-theme=dark]` (§5.2) |
| `frontend/src/styles/fonts.css` | new | `@font-face` via @fontsource imports (§5.3) |
| `frontend/src/lib/api.ts` | new | fetch wrapper: base URL, credentials, CSRF header, key errors (§5.6) |
| `frontend/src/lib/csrf.ts` | new | `getCookie('csrftoken')`, `ensureCsrf()` (§5.6) |
| `frontend/src/i18n/index.ts` | new | react-i18next init, detector, persistence (§5.5) |
| `frontend/src/i18n/en.json` | new | English base catalog |
| `frontend/src/i18n/sk.json` | new | Slovak complete catalog |
| `frontend/src/theme/ThemeProvider.tsx` | new | theme state + persist + data-theme (§5.4) |
| `frontend/src/theme/useTheme.ts` | new | hook |
| `frontend/src/auth/AuthProvider.tsx` | new | bootstrap from /auth/me; login/register/logout (§5.10) |
| `frontend/src/auth/useAuth.ts` | new | hook |
| `frontend/src/auth/RequireAuth.tsx` | new | auth guard (§5.9) |
| `frontend/src/auth/RequireRole.tsx` | new | role guard (§5.9) |
| `frontend/src/components/Button.tsx` | new | primary/ghost (§5.8) |
| `frontend/src/components/Card.tsx` | new | card (§5.8) |
| `frontend/src/components/Input.tsx` | new | text + numeric-mono variant (§5.8) |
| `frontend/src/components/StatTile.tsx` | new | hero metric tile (§5.8) |
| `frontend/src/components/Pill.tsx` | new | pill + warn/ok variants (§5.8) |
| `frontend/src/components/Avatar.tsx` | new | initials avatar (§5.8) |
| `frontend/src/components/ThemeToggle.tsx` | new | theme pill toggle (§5.4) |
| `frontend/src/components/LanguageSwitcher.tsx` | new | EN/SK switch, persisted (§5.5) |
| `frontend/src/components/AppShell.tsx` | new | topbar + layout frame (§5.8) |
| `frontend/src/components/Spinner.tsx` | new | bootstrap loader |
| `frontend/src/pages/LoginPage.tsx` | new | login (§5.10) |
| `frontend/src/pages/RegisterPage.tsx` | new | open register + trainer picker (§5.10) |
| `frontend/src/pages/RootRedirect.tsx` | new | role redirect (§5.9) |
| `frontend/src/pages/NotFoundPage.tsx` | new | 404 |
| `frontend/src/pages/TraineeHomePlaceholder.tsx` | new | `/me` stub (P6 replaces) |
| `frontend/src/pages/TrainerHomePlaceholder.tsx` | new | `/trainer` stub (P7 replaces) |
| `.gitignore` | edit | add `frontend/node_modules/`, `frontend/dist/`, `frontend/.env` |
| `README.md` | edit | add frontend run/build instructions (npm install, dev, proxy, build) |
| **Backend (only if §11 Q6 = same-origin serve):** | | |
| `progresso/urls.py` | edit | SPA catch-all after `admin/` + `api/v1/` (§5.7) |
| `core/api/views.py` or a new `frontend view` | edit/new | thin `index.html` return, no logic (§5.7) |
| `progresso/settings/*` | edit | WhiteNoise/static config for the built SPA (§5.7) |

No `CLAUDE.md` exists (deferred to P8 per P1 §13). Not created here.

---

## 7. Manual verification (no automated tests — epic §3)

Run the Django backend (`python manage.py runserver`) and the Vite dev server (`npm run dev` in `frontend/`)
with the proxy. Each step maps to an AC.

1. **Toolchain boots.** `cd frontend && npm install && npm run dev` starts Vite with no errors; the app loads
   at the dev URL; `/api/*` proxies to `:8000` (network tab shows same-origin requests).
2. **Aesthetic (AC-2, AC-3).** The login screen and placeholder homes match `design-preview.html`: navy
   surfaces, cyan accent, Orbitron headings/logo, Inter UI, JetBrains Mono numbers, rounded cards, soft
   shadows. Inspect an element — colors resolve from `var(--token)`; **grep the built/`src` `.tsx` for hex
   literals → none** (AC-3).
3. **Theme toggle + prefers-color-scheme (AC-4).** With OS in dark mode and no saved pref, first load is
   dark; toggle → light; reload → stays light (localStorage). No light→dark flash on reload (no-flash
   script). Glow appears on accent buttons/focus in dark, absent in light.
4. **i18n (AC-7).** Switch EN→SK via the shell switcher — **all** visible strings change (search the running
   UI for any untranslated English; there should be none). Reload → language persists. A wrong-password
   login shows the SK translation of `invalid_credentials` when SK is active. Dates/numbers format per
   locale. Confirm no string literals in components (grep catalogs vs `t(` usage).
5. **Auth bootstrap + guards (AC-5).**
   - Unauthenticated: visiting `/` or `/me` redirects to `/login`; a `Spinner` shows briefly while `/auth/me`
     resolves (`403` → treated as anonymous).
   - Register a trainer via `/register` (role=trainer) → auto-logged-in → lands on `/trainer`.
   - Register a trainee via `/register` (role=trainee), picking the trainer from the populated dropdown →
     auto-logged-in → lands on `/me`.
   - As the trainee, manually navigating to `/trainer` is blocked by `RequireRole` (redirect/deny).
   - Login/logout: `/logout` clears the session and returns to `/login`; `/auth/me` afterwards is anonymous.
6. **CSRF handshake (AC-5, P1 §13).** After login, the `csrftoken` cookie is present (seeded by `/auth/me`);
   `/logout` (unsafe, authenticated) succeeds with the `X-CSRFToken` header and **fails without it** — proving
   the client sends it. Anonymous login/register work with no token.
7. **Error key mapping (AC-7).** Register with a taken username → localized `username_taken` message; weak
   password → localized `password_too_weak`; trainee picking an invalid trainer → localized `invalid_trainer`.
8. **Accessibility (AC-6).** Keyboard-tab through login/register — every control has a visible focus ring;
   theme/lang toggles have accessible labels; body copy uses navy `--text`/`--heading`, accent only on
   interactive/large elements. Spot-check contrast in both themes.
9. **PWA installable + offline shell (AC-1).** `npm run build && npm run preview` (or the same-origin Django
   serve if Q6 = serve): the browser offers "Install app"; the manifest validates (name, icons, theme-color,
   standalone); with the network throttled to offline **after first load**, the app shell still renders
   (SW-cached). Responsive: mobile viewport is single-column/thumb-reachable; desktop reflows to the
   max-width frame.

---

## 8. Risks / notes

- **Same-origin is the linchpin.** Session + CSRF are far simpler same-origin (dev proxy, prod same domain).
  If the developer insists on a separate SPA host, CORS + `SameSite=None` cookies + `CSRF_TRUSTED_ORIGINS`
  are required and cookie handling gets fragile — hence §11 Q6. Default: same-origin.
- **CSRF timing.** The first unsafe request must have the `csrftoken` cookie; `AuthProvider` calling
  `/auth/me` on start guarantees it before any logout/write. Documented so P6/P7 don't re-solve it.
- **No-flash theme script** must run before React mounts, or users see a theme flash — keep it inline in
  `index.html`, not in a bundled module.
- **SK catalog completeness** is an AC (parallel, complete). Machine-drafted SK is acceptable for MVP but
  flag it for a native review (epic Q6 wants SK first-class). Keys, not prose, keep it maintainable.
- **Node toolchain enters the repo** for the first time (the backend had none). Gitignore `node_modules/`
  and `dist/`; document the two-process dev flow (Django + Vite) in `README.md`.
- **Placeholder homes** must stay obviously stubbed so P6/P7 don't mistake them for finished screens — label
  them as placeholders.

---

## 11. Open questions (proposals — confirm before implementing)

- **Q1 — Register screen in P5?** P1 §0 made onboarding **open self-registration** (`/auth/register` +
  `/auth/trainers`), but the epic P5 brief lists only `/login`. **Proposal:** include `/register` (with the
  role choice + trainer picker) in P5 — it's the only way to create accounts now, so the shell is unusable
  without it. *(Default: yes, build `/register`.)*
- **Q2 — Build tool = Vite + React + TypeScript.** Epic locks React + Tailwind but not the bundler/language.
  **Proposal:** Vite + TS (fast, first-class Tailwind + PWA plugin, TS mirrors the backend's strict-typing
  ethos). *(Default: Vite + TypeScript.)*
- **Q3 — Fonts self-hosted vs Google Fonts CDN.** `design-system.md` §3 says "Load from Google Fonts";
  `design-preview.html`'s note says the shipped app inlines them and CSP blocks CDNs; the PWA must work
  offline (AC-1). **Proposal:** self-host via `@fontsource/*` (offline-safe, no third-party origin).
  *(Default: self-hosted.)*
- **Q4 — Data-fetching library.** P5 needs only the auth client. **Proposal:** ship a thin `fetch` wrapper +
  `AuthProvider` now; let P6/P7 decide whether to add TanStack Query for their heavier data screens (note it
  as a likely P6 addition). *(Default: thin fetch wrapper in P5, defer TanStack Query.)*
- **Q5 — Language switcher placement.** **Proposal:** an EN/SK control in the `AppShell` topbar next to the
  theme toggle, and also reachable on the login/register screens (so pre-auth users can switch). *(Default:
  topbar + auth screens.)*
- **Q6 — SPA serving model (backend touch, §5.7).** Same-origin serve (Django/Vercel serves `frontend/dist`
  + catch-all) **vs** separate SPA host + `django-cors-headers`. **Proposal:** same-origin — simplest,
  keeps P1's CSRF handshake intact, no CORS. The final production wiring is P8; P5 only needs the dev proxy
  + a minimal catch-all. *(Default: same-origin; add only the minimal catch-all in P5, full deploy in P8.)*
- **Q7 — App/logo name.** `design-preview.html` says "TRENER"; the app is now **Progresso** (epic header).
  **Proposal:** use "PROGRESSO" everywhere in the shell. *(Default: Progresso.)*

---

## 13. Post-Implementation

**Built (all §11 defaults Q1–Q7 taken).** A greenfield Vite + React + TypeScript + Tailwind PWA in
`frontend/`: single-source design tokens (CSS custom properties, no hex in components) mapped into
`tailwind.config.ts`; self-hosted Orbitron/Inter/JetBrains Mono via `@fontsource`; light/dark theme
(prefers-color-scheme default + no-flash inline script + persisted toggle); EN/SK i18n via react-i18next
(persisted switcher, error-key mapping, locale number/date helpers); a reusable component kit
(Button/Card/Input/StatTile/Pill/Avatar/AppShell/Spinner + Theme/Language toggles); session-auth API client
with CSRF handshake; router with auth + role guards; `/login`, `/register` (open self-register + trainer
picker), `/logout`, `/` role redirect, and `/me` `/trainer` placeholders. Backend: minimal same-origin SPA
catch-all (`progresso/spa.py` + `progresso/urls.py`) serving the built shell.

**Verification.** `npm run build` clean (tsc strict + vite + PWA `sw.js`/manifest generated). Django `check`
clean. Backend contract smoke-tested via HTTP: `/auth/me` anon→403, register→201 (sets `csrftoken`+`sessionid`,
auto-login), authed `/auth/me`→200, logout **fails 403 without** `X-CSRFToken` and **succeeds 204 with** it
(proves the CSRF handshake), bad login→401 `{detail:"invalid_credentials"}`, dup register→400
`{"username":["username_taken"]}` — the client's error extractor handles both envelopes. No browser-driven
manual pass was run (no automated tests per epic §3); the developer should exercise the UI flows in §7.

**Follow-ups / notes for the developer:**
- **CSRF seeding is via the authenticated response, not anonymous `/auth/me`.** `ensure_csrf_cookie` runs only
  after `IsAuthenticated` passes; anonymous `/auth/me` returns 403 with no cookie. The cookie is seeded by
  login/register token rotation and by authed `/auth/me`. `ensureCsrf()` (called before any unsafe request)
  GETs `/auth/me` while authenticated, so logout/writes always have the token. Comment in `csrf.ts` corrected.
- **Prod static-asset serving deferred to P8** (per §3). The P5 catch-all returns `dist/index.html` only;
  serving `dist/assets/*` (WhiteNoise + `STATIC_ROOT`/`STATICFILES_DIRS`) was **not** added — it's a new
  dependency + deploy wiring that the plan scopes to P8. Dev uses the Vite dev server; PWA/offline is verified
  via `npm run preview`. The regex excludes `assets/` so it won't mis-serve them.
- **Branch:** implemented on `main` at the developer's request (not a `feature-P5` branch).
- **SK catalog** is developer-drafted; flag for native review (epic Q6 wants SK first-class).
- A `smoke_p5_x1` trainer user was created in the dev SQLite DB during verification (harmless; delete if
  desired via `/admin/`).
- `npm audit` reports 5 advisories (4 moderate, 1 high) in the dev toolchain (transitive) — none in shipped
  runtime deps; left as-is (no `audit fix --force` to avoid breaking-change bumps).
```
