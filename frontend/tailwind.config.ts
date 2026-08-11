import type { Config } from 'tailwindcss'

// Every value references a CSS custom property from src/styles/tokens.css —
// the token file is the single source of truth; no literal hex lives here.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', ':root[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bgdeep: 'var(--bg-deep)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        text: 'var(--text)',
        heading: 'var(--heading)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        border: 'var(--border)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        glow: 'var(--glow)',
      },
    },
  },
  plugins: [],
} satisfies Config
