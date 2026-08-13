// Mobile-only topbar menu: a ☰ trigger that opens a full-screen slide-down overlay
// holding the chrome controls (language, theme, profile, logout). Desktop keeps the
// inline cluster in AppShell (this whole component is md:hidden). Pattern mirrors
// qeaas.eu: fixed overlay below the header, transitioned on translate-y + opacity,
// visibility-gated so it's inert when closed. Tokens (bgdeep/heading/accent), not hex.
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { User } from '../auth/AuthProvider'
import { ThemeToggle } from './ThemeToggle'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Avatar } from './Avatar'
import { Button } from './Button'

interface MobileMenuProps {
  user: User | null
  onLogout: () => void
}

export function MobileMenu({ user, onLogout }: MobileMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Close on route change (selecting a link/logging out navigates away).
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <div className="ml-auto md:hidden">
      <button
        type="button"
        aria-label={t('nav.menu')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-heading focus:outline-none focus:ring-2 focus:ring-accent hover:text-accent"
      >
        <span aria-hidden="true">{open ? '✕' : '☰'}</span>
      </button>

      <div
        aria-hidden={!open}
        className={
          'fixed inset-0 top-16 z-40 flex flex-col items-center gap-8 overflow-y-auto bg-bgdeep pt-12 transition-all duration-500 ease-in-out md:hidden ' +
          (open
            ? 'visible pointer-events-auto translate-y-0 opacity-100'
            : 'invisible pointer-events-none -translate-y-full opacity-0')
        }
      >
        <LanguageSwitcher />
        <ThemeToggle />
        {user && (
          <Link
            to="/profile"
            aria-label={t('nav.profile')}
            className="flex items-center gap-2 rounded-full text-heading focus:outline-none focus:ring-2 focus:ring-accent hover:opacity-80"
          >
            <Avatar name={user.username} />
            <span className="font-sans text-base">{t('nav.profile')}</span>
          </Link>
        )}
        <Button variant="ghost" onClick={onLogout}>
          {t('nav.logout')}
        </Button>
      </div>
    </div>
  )
}
