// Theme state: default follows prefers-color-scheme when unset, toggle flips light↔dark,
// choice persists to localStorage, and data-theme on <html> drives the token vars (AC-4).
// The no-flash inline script in index.html already applied the initial attribute before
// paint; this provider adopts that value and owns changes from here.
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextValue | null>(null)

function readInitialTheme(): Theme {
  const current = document.documentElement.getAttribute('data-theme')
  if (current === 'light' || current === 'dark') return current
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}
