# Feature Plan: P11 — Home dashboard shows all logged metrics

**Epic:** `tasks/plans/epic-progresso-rebuild.md` (Status: Approved) — post-MVP follow-up (like P9/P10).
**Plan ID:** P11
**Slug:** home-all-metrics
**Author:** Claude (Opus)
**Date:** 2026-08-12
**Status:** Complete — approved with all §6 defaults; implemented and manually verified.

> **No GitHub issue.** AC quoted from the developer's request this session.
> **No automated tests** (epic §3). Verification is manual only (§5). No test files.

---

## 1. Goal

The trainee home (`/me`, "Your progress") currently shows only a fixed trio — weight (hero) + waist + chest —
as stat tiles and as mini charts (P9, `frontend/src/pages/TraineeHome.tsx:38` `SECONDARY`, `:19` `CHART_METRICS`).
The request: show **every metric the trainee has actually logged** — weight, body measurements, body fat, and
**BMI** — not just the trio. Presentational only; the data is already in the loaded series.

---

## 2. Acceptance criteria (quoted from the request)

> "Your progress at the home page should have all of the things measured in the main screen not just last
> logged so if i logged my body, my weight and my bmi it should display all of them"

- **AC-1** ✅ At the **top** of `/me`, the snapshot renders a **stat tile for every metric present** in the
  trainee's history (weight, chest, waist, hips, biceps, thigh, calf, body_fat_pct, **and BMI**) showing the
  **latest value** of each — not just weight/waist/chest. A metric never logged is omitted (no empty tile).
  *(Covered: `frontend/src/pages/TraineeHome.tsx:75` present-filter, `:117-130` tile grid.)*
- **AC-2** ✅ The mini-chart grid renders a compact chart for **every present metric** that has ≥2 data points,
  but each chart is **capped to the latest 4 measurements** (the tail of the history), so the charts stay
  legible while the tiles above show every current value. *(Covered:
  `frontend/src/pages/TraineeHome.tsx:25` `CHART_WINDOW`, `:78-81` windowed chartable, `:150-164` render.)*
- **AC-3 (carried invariants)** ✅ No hardcoded strings (all via `t()`, EN+SK already cover `metrics.*`); no
  hardcoded hex (colors via each metric's `colorVar` token); numbers/dates mono; `tsc` strict + `npm run
  build` clean (built in 2.71s). Presentational only.

---

## 3. Out of scope

- No new metrics, no backend/series change — the series already returns every present metric + `bmi`
  (`core/services/chart_data.py`). Height is intentionally absent (once-set profile attribute, P9).
- No per-user metric selection / reordering / hide controls (post-MVP). Order is the canonical `METRICS`
  order.
- No change to the trainer screens (they already chart per-metric via `ProgressView`).

---

## 4. Design / approach

`frontend/src/pages/TraineeHome.tsx` (edit) — drive the tiles and charts off **what's present in the series**
instead of the hardcoded lists:

- **Present metrics, canonical order.** Import `METRICS` from `lib/metricMeta` and derive:
  `const present = METRICS.filter((m) => series.summary[m.key])` — the metrics that have a summary (i.e. at
  least one reading), in the canonical order (weight first … body_fat_pct … bmi last). `bmi` is included (the
  series provides it whenever weight + profile height exist).
- **Stat tiles (AC-1).** Replace the fixed hero-weight + `SECONDARY` block with a grid mapping `present` →
  `StatTile` (label `t(meta.labelKey)`, value `formatWithUnit(summary.latest, meta.unit)`, delta via the
  existing `deltaText`, `deltaLabel` `home.trainee.delta`, trend via `trendOf`). Keep weight visually first
  (it's first in `METRICS`). BMI's unit is `''` (unitless) — `formatWithUnit` already handles an empty unit.
  Drop the now-unused `SECONDARY` const and the single-hero special case (§6 Q1: uniform tiles).
- **Mini charts (AC-2), capped to the latest 4.** Take the same `present` list. Window the series to the tail:
  `const CHART_WINDOW = 4`, `const dates4 = series.dates.slice(-CHART_WINDOW)`, and for each metric
  `const data4 = series.metrics[m.key].slice(-CHART_WINDOW)`. Chart a metric only when its windowed slice has
  ≥2 non-null points (`data4.filter((v) => v !== null).length >= 2`). Render one compact `MetricChart` per
  qualifying metric (`labels={dates4}`, `data={data4}`, `size="compact"`, `colorVar={meta.colorVar}` — the P9
  compact card). Remove the old `CHART_METRICS` array. (Slicing the last 4 of an ascending series = the 4 most
  recent entries; the tiles above still reflect the *latest* value regardless of the window — §6 Q3.)
- Everything else on the page (headline + log button + overdue pill + last-logged line + "Trends"
  heading/"view all" link) is unchanged.

No i18n additions — every metric label already exists under `metrics.*` (EN+SK). No new component.

---

## 4a. File Plan

| File | Change | Notes |
|------|--------|-------|
| `frontend/src/pages/TraineeHome.tsx` | edit | tiles + charts driven by present metrics (canonical order), replacing the `SECONDARY`/`CHART_METRICS` trio (§4) |

No backend change, no new dependency, no i18n change, no test files (epic §3).

---

## 5. Manual verification (no automated tests — epic §3)

1. **AC-1.** As a trainee, log a measurement with several fields (weight, waist, biceps, body fat…) and set a
   profile height (so BMI exists). On `/me`, a stat tile appears for **each** logged metric **and** BMI, in
   canonical order; a metric never logged has no tile.
2. **AC-2.** With ≥2 entries, each present metric shows a compact chart plotting **only the latest 4**
   measurements (log 6+ entries → the chart x-axis shows the last 4 dates, not all 6). A metric with fewer
   than 2 readings in that window shows its tile but no chart. The tiles above still show the true latest
   value.
3. **AC-3.** EN→SK flips every metric label (already covered). Grep the file for string literals / hex →
   none new. `npm run build` clean. Confirm the trainer roster/overview screens are unaffected.

---

## 6. Open questions (proposals — confirm before implementing)

**Resolved (all defaults adopted).** Q1 → uniform tiles, weight first (canonical order). Q2 → BMI shown as
tile + chart like any present metric. Q3 → chart window = latest 4. Q4 → no cap on chart count. Q5 → `main`.

- **Q1 — Keep a distinct "hero" weight tile, or uniform tiles?** **Proposal:** uniform tiles for all present
  metrics, weight naturally first (canonical order) — simplest and scales to "show all". *(Default: uniform,
  weight first.)* Alt: keep weight as a larger hero tile above a uniform grid of the rest.
- **Q2 — Include BMI as both a tile and a chart?** **Proposal:** yes — the request names BMI explicitly; it's
  in the series whenever computable. *(Default: BMI shown like any other present metric.)*
- **Q3 — Chart window = latest 4 (developer, this session).** Each chart plots only the **latest 4**
  measurements (tail of the ascending series); the stat tiles still show the true latest value of every metric.
  *(Resolved: latest 4.)*
- **Q4 — Cap the number of charts?** All present metrics could be up to 9 charts (each now only 4 points).
  **Proposal:** no cap on how many metrics get a chart — the request is "all of the metrics"; a stacked 2-up
  grid of small 4-point charts is fine. *(Default: no cap on chart count.)*
- **Q5 — Branch.** **Proposal:** `main` (consistent with P5–P10). *(Default: `main`.)*

---

## 13. Post-implementation

Drove tiles and charts off `present = METRICS.filter((m) => series.summary[m.key])` (canonical order, BMI
last) instead of the hardcoded `SECONDARY`/`CHART_METRICS` trio, which were removed along with the single-hero
special case — tiles are now uniform. Charts window to `series.dates.slice(-4)` / `metrics[key].slice(-4)` and
draw only when the windowed slice keeps ≥2 non-null points. Removed the now-unused `METRIC_BY_KEY`/`MetricKey`
imports (only `METRICS` needed). Single file, no backend, no i18n, no deps. Build clean.
