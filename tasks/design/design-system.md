# Trener App — Design System

> Visual language for the rebuild, derived from **peterjas.sk**, **qeaas.eu**, and **8888.sk**. All three share one DNA: deep-navy tech aesthetic, cyan accent, Orbitron display type, Inter body, JetBrains Mono for numbers/data. The trener app adopts this system so it reads as part of the same family.

Source of truth for tokens: `peterjas.sk` (fully tokenized, 3 themes). `qeaas.eu` confirms the Orbitron/Inter/JetBrains stack and cyan-glow treatment. `8888.sk` confirms the same skeleton with a teal accent variant.

---

## 1. Brand character

- **Feel:** precise, technical, trustworthy — "instrument panel," not "fitness bro." Fits a data-tracking coaching app.
- **Signature moves:** Orbitron for headings/logo (geometric, futuristic), JetBrains Mono for all *numbers* (measurements, dates, weights — monospace makes columns of data align and feel like readouts), cyan accent that glows on dark surfaces.
- **Surfaces:** deep navy layering (bg → surface → card), thin cyan-tinted borders, soft navy shadows, generous rounded corners.

---

## 2. Color tokens

Three themes carried over from peterjas.sk: **light** (default), **dark**, **deep** (near-black OLED). Ship light + dark for MVP; deep is a nice-to-have toggle.

### Light (default)
```css
--bg-deep:      #f8fafc;   /* app background */
--bg:           #ffffff;   /* cards / sheets */
--surface:      #eaf6ff;   /* raised panels, inputs */
--text:         #0a2540;   /* body text */
--heading:      #052e44;   /* headings */
--accent:       #00aaff;   /* primary action, links, active */
--primary:      #084666;   /* buttons (deep navy) */
--primary-hover:#052e44;
--border:       rgba(0,170,255,0.16);
--success:      #0d9f6e;
--glow:         none;
```

### Dark
```css
--bg-deep:      #052e44;
--bg:           #0a2540;
--surface:      #084666;
--text:         #e2e8f0;
--heading:      #f8fafc;
--accent:       #00aaff;
--primary:      #00aaff;
--primary-hover:#0077cc;
--border:       rgba(0,170,255,0.24);
--success:      #34d399;
--glow:         0 0 10px var(--accent);
```

### Deep (OLED, optional)
```css
--bg-deep:      #01040b;
--bg:           #060c1f;
--surface:      #060c1f;
--text:         #e3f6ff;
--heading:      #7ad9ff;
--accent:       #4dcfff;
--border:       rgba(0,170,255,0.35);
--success:      #4dcfff;
--glow:         0 0 14px var(--accent);
```

### Semantic / chart palette (measurements)
Data lines need distinct-but-on-brand hues. Base off the cyan family plus supporting tones:
```
weight  #00aaff (accent)
chest   #4dcfff
waist   #0d9f6e (success green)
biceps  #7ad9ff
thigh   #0077cc
calf    #34d399
warning #d97706   error #dc2626   (from qeaas semantic set)
```

---

## 3. Typography

Load from Google Fonts (as peterjas does):
```
Orbitron: 400;600;700       -> display / headings / logo / big stat numbers
Inter: 400;500;700;900      -> body, UI, labels
JetBrains Mono: 400;600     -> measurement values, dates, tables, code-like data
```
```css
--font-display: "Orbitron", var(--font-sans);
--font-sans:    "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono:    "JetBrains Mono", "Fira Code", monospace;
```

### Usage rules
- **Orbitron** — page titles, section headers, the app logo, and *hero stat numbers* ("82.4 kg"). Uppercase or wide tracking for headers. Don't use for body — hurts readability.
- **Inter** — all UI text, buttons, form labels, paragraphs. Weight 400 body, 500 labels, 700 emphasis, 900 rare hero.
- **JetBrains Mono** — every measurement value, weight, date, and the measurement table/list. Monospace = readouts line up, feels like an instrument. This is the app's signature.

Scale (rem): 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 2 / 2.5 / 3.

---

## 4. Shape, elevation, motion

```css
--radius-sm: 12px;   /* inputs, small buttons */
--radius-md: 14px;   /* cards */
--radius-lg: 20px;   /* panels, sheets */
--radius-pill: 30px; /* pills, tags, avatar chips (50% for avatars) */
```
Shadows (soft, navy-tinted — from all three sites):
```css
--shadow-card: 0 8px 32px rgba(8,70,102,0.16);
--shadow-soft: 0 8px 28px color-mix(in srgb, var(--accent) 30%, transparent);
```
- **Glow** (`--glow`) applies only on dark/deep themes, for accent buttons and active/focus rings. Off in light.
- **Motion:** subtle. 150–250ms ease on hover/press; accent glow fade-in on focus. No bounce. Instrument-like restraint.

---

## 5. Component patterns

- **Buttons:** primary = filled `--primary` (navy on light, cyan on dark), radius-sm, Inter 500. Hover → `--primary-hover` + glow on dark. Secondary = transparent, `--border`, accent text.
- **Cards:** `--bg` fill, `--border` 1px, `--radius-md`, `--shadow-card`. Measurement entries and trainee roster items are cards.
- **Stat tile** (hero metric): big Orbitron number + tiny Inter label + JetBrains Mono delta ("▲ +0.6 kg"). Delta green/red via success/error.
- **Inputs:** `--surface` fill, `--border`, `--radius-sm`, accent focus ring (+glow dark). Numeric inputs use JetBrains Mono.
- **Charts (Chart.js):** transparent bg, `--border` gridlines at low opacity, lines from the chart palette, cyan accent for the primary metric, JetBrains Mono tick labels.
- **Tables / measurement list:** JetBrains Mono values, Inter headers, zebra via `--surface` at low alpha, cyan hover row.
- **Tags/pills:** `--radius-pill`, accent-tinted bg (`rgba(0,170,255,0.14)`), accent text. Use for goal status, "overdue," roles.
- **Avatars:** circle (`border-radius:50%`), thin accent ring.

---

## 6. Layout

- Mobile-first (trainee capture on phone). Single-column, thumb-reachable actions, bottom action bar for primary CTA.
- Trainer cockpit: responsive grid of trainee cards on desktop, stacked on mobile.
- Generous whitespace; content max-width ~ 1100px on desktop, edge padding 16–24px.
- Dark theme is a first-class citizen (gym lighting) — respect `prefers-color-scheme` and offer a manual toggle.

---

## 7. Implementation notes

- Define all tokens as CSS custom properties on `:root` (light), `[data-theme="dark"]`, `[data-theme="deep"]` — exactly the peterjas.sk pattern.
- If frontend is React + Tailwind: map these tokens into `tailwind.config` theme so utilities resolve to the brand.
- Keep the token file the single source; never hardcode a hex in a component.
- Accessibility: cyan `#00aaff` on white passes for large text/UI but **not** small body text — use `--text`/`--heading` navy for paragraphs, reserve accent for interactive + large. Check contrast on the deep theme.

---

## 8. One-line summary for tickets

> "Instrument-panel" aesthetic: deep-navy surfaces, cyan `#00aaff` accent with dark-mode glow, **Orbitron** headings, **Inter** UI, **JetBrains Mono** for every number. Rounded cards (12–20px), soft navy shadows, mobile-first, light + dark themes tokenized as CSS variables.
