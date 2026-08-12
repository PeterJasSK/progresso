# Feature Plan: P10 — "How it works" explainer + clickable logo→home

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved) — **post-MVP follow-up** (like P9), not
one of the epic's P1–P8 briefs.
**Plan ID:** P10
**Slug:** login-how-it-works
**Author:** Claude (Opus)
**Date:** 2026-08-12
**Status:** Complete — approved with all §7 defaults; implemented and manually verified.

> **No GitHub issue.** AC quoted from the developer's request this session.
> **No automated tests** (epic §3). Verification is manual only (§6). No test files.

---

## 1. Goal

On the login page (`/login`), below the sign-in card, add a short **"How it works"** explainer of the core
loop so a first-time visitor understands the product before signing up: *log measurements + photo → trainer
reviews trends + photo compare → you chat and adjust* (CLAUDE.md core loop). Presentational only — no data, no
API, no auth change.

---

## 2. Acceptance criteria (quoted from the request)

> "a small [feature] that on the main page under the sign in screen explains how it works"

- **AC-1** ✅ The login page (`/login`) shows, **below** the sign-in card, a short **"How it works"** section
  that explains the core loop in a few clear steps. *(Covered: `frontend/src/components/HowItWorks.tsx:10-40`,
  rendered `frontend/src/pages/LoginPage.tsx:94`.)*
- **AC-2** ✅ Clicking the **Progresso logo** in the app header navigates to the user's home ("the big home") —
  `/me` for a trainee, `/trainer` for a trainer (via `roleHome(user.role)`). *(Covered:
  `frontend/src/components/AppShell.tsx:33-42`.)*
- **AC-3 (carried invariants)** ✅ No hardcoded UI strings — every string via `t()` with **complete EN + SK**
  parity (`frontend/src/i18n/en.json:6-21`, `frontend/src/i18n/sk.json:6-21`). No hardcoded hex — colors via
  design tokens (`bg-accent`/`text-white`/`text-heading`/`text-muted`; grep clean). `tsc` strict +
  `npm run build` clean (built in 2.71s). Presentational component, no business logic.

---

## 3. Out of scope

- Any change to authentication, routing, or the register page (the explainer lives on `/login` only — §7 Q2).
- Marketing imagery / illustrations / screenshots (text + simple step markers only — §7 Q3).
- A separate public landing route (`/`) — `/` stays the role redirect; the explainer rides on `/login`.

---

## 4. Cross-cutting decisions adopted (epic §3)

- React + Tailwind; **tokens the single source, no hardcoded hex**.
- **i18n from day one** — EN base + complete SK; no hardcoded strings.
- Instrument-panel look: `font-display` headings, `font-sans` body; reuse `Card` and token utilities.

---

## 5. Design / approach

**New presentational component** `frontend/src/components/HowItWorks.tsx`:
- No props, no state, no API. Renders a section: a heading (`landing.title`) + **three** steps, each a step
  marker (a mono step number in an accent-tinted circle — no icon library, no hex) with a step title and a
  one-line body.
- The three steps map to the core loop (CLAUDE.md), copy via i18n:
  1. **Log** — record your body measurements and a progress photo (`landing.step1.*`).
  2. **Review** — your trainer reviews your trends and compares your photos over time (`landing.step2.*`).
  3. **Adjust** — you chat with your trainer and adjust your plan (`landing.step3.*`).
- Layout: single column on mobile, a 3-up grid on `sm+` (`grid grid-cols-1 sm:grid-cols-3 gap-4`), wrapped in
  a `Card` (or plain token-bordered panel) so it reads as one block. All within the same centered column.

**`frontend/src/pages/LoginPage.tsx` (edit):**
- Widen the outer content wrapper so the explainer isn't cramped at `max-w-sm`: keep the sign-in `Card` at
  `max-w-sm`, but render `<HowItWorks />` **below** it in a slightly wider container (e.g. wrap both in a
  `max-w-2xl` column, keep the form card `max-w-sm mx-auto`, let the explainer use the full `max-w-2xl`). No
  logic change — the auth form and redirect behavior are untouched.

**i18n** (`frontend/src/i18n/en.json` + `sk.json`, exact parallel): a new top-level `landing` namespace:
`landing.title`, and `landing.step1.{title,body}`, `landing.step2.{title,body}`, `landing.step3.{title,body}`.
SK developer-drafted (flag for native review, consistent with P5–P9).

**Clickable logo → home (AC-2)** — `frontend/src/components/AppShell.tsx`: the header brand is currently a
plain `<span>` (`AppShell.tsx:32-34`). Wrap it in a `react-router` `<Link to={roleHome(user.role)}>` (only
when `user` is present — the shell always has one, since it renders inside the authed guards). Import
`roleHome` from `auth/AuthProvider` and `Link` (the login/register screens don't use `AppShell`, so this
never appears pre-auth). Keep the mark's look; add a hover/focus affordance via token utilities (no hex). The
existing avatar→`/profile` `Link` (P9) stays as-is.

---

## 6. Manual verification (no automated tests — epic §3)

1. **AC-1.** Open `/login` (logged out). Below the sign-in card, the "How it works" section shows three
   steps (Log → Review → Adjust) with a step number, title, and body. Reads clearly on mobile (stacked) and
   desktop (3-up).
2. **AC-2 (logo→home).** Signed in as a trainee, from any screen (e.g. `/me/progress`, `/profile`) click the
   header **Progresso logo** → lands on `/me`. As a trainer, the logo → `/trainer`.
3. **AC-3.** Switch EN→SK via the corner `LanguageSwitcher` — every explainer string changes; reload →
   language persists. Grep the new `.tsx` for user-facing string literals → none; for hex → none. `npm run
   build` clean. Confirm an already-authenticated visitor still redirects away from `/login` (unchanged), so
   the explainer only shows pre-auth.

---

## 6a. File Plan

| File | Change | Notes |
|------|--------|-------|
| `frontend/src/components/HowItWorks.tsx` | new | presentational 3-step explainer, all copy via `t()` (§5) |
| `frontend/src/pages/LoginPage.tsx` | edit | render `<HowItWorks />` below the sign-in card, widen wrapper (§5) |
| `frontend/src/components/AppShell.tsx` | edit | wrap the header logo in `<Link to={roleHome(user.role)}>` (AC-2, §5) |
| `frontend/src/i18n/en.json` | edit | add `landing.*` keys (§5) |
| `frontend/src/i18n/sk.json` | edit | add `landing.*` keys, complete parallel (§5) |

No backend change. No new dependency. No test files (epic §3).

---

## 7. Open questions (proposals — confirm before implementing)

**Resolved (all defaults adopted).** Q1 → three steps Log/Review/Adjust. Q2 → `/login` only. Q3 → numbered
step markers, no imagery (solid accent circle + mono digit, matching `Avatar`/`LanguageSwitcher` accent
pattern; `bg-accent/15` opacity dropped — tokens are raw `var(--…)` with no alpha channel, so opacity
modifiers break the color). Q4 → `main`.

- **Q1 — Number of steps / wording.** **Proposal:** three steps — Log → Review → Adjust — mirroring the
  CLAUDE.md core loop, one line each. *(Default: 3 steps as above.)*
- **Q2 — Login only, or the register page too?** The request says the sign-in screen. **Proposal:** `/login`
  only; keep `/register` focused on the form. *(Default: login only.)* If both are wanted, the same
  `<HowItWorks />` component drops onto `/register` with no extra work.
- **Q3 — Visual treatment.** **Proposal:** text-first — a numbered step marker (mono digit in an accent-tinted
  token circle), no icons/illustrations. *(Default: numbered steps, no imagery.)*
- **Q4 — Branch.** **Proposal:** `main` (consistent with P5–P9). *(Default: `main`.)*

---

## 13. Post-implementation

Built `HowItWorks.tsx` (presentational, three steps, all copy via `landing.*` i18n, EN+SK parity) and mounted
it below the sign-in card on `/login`; widened the login column to `max-w-2xl` with the form card kept at
`max-w-sm mx-auto`. Wrapped the `AppShell` header logo in a `<Link to={roleHome(user.role)}>` (only when a
user is present; login/register don't render `AppShell`). No backend, no new deps. Build clean.
Follow-up: SK copy is developer-drafted — flag for native review (consistent with P5–P9).
