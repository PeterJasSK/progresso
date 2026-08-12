// Authenticated frame: topbar (logo, theme + language toggles, logout) + centered
// max-width content column, mobile-first. actionBar is a slot P6 fills with its primary
// CTA on mobile. All chrome labels come through i18n.
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { roleHome } from '../auth/AuthProvider'
import { ThemeToggle } from './ThemeToggle'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Avatar } from './Avatar'
import { Button } from './Button'

interface AppShellProps {
  children: ReactNode
  actionBar?: ReactNode
}

export function AppShell({ children, actionBar }: AppShellProps) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-bgdeep">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-4 py-3">
          {user ? (
            <Link
              to={roleHome(user.role)}
              aria-label={t('nav.home')}
              className="rounded font-display text-lg font-bold text-heading focus:outline-none focus:ring-2 focus:ring-accent hover:opacity-80"
            >
              <span className="text-accent">◆</span> {t('app.name').toUpperCase()}
            </Link>
          ) : (
            <span className="font-display text-lg font-bold text-heading">
              <span className="text-accent">◆</span> {t('app.name').toUpperCase()}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            {user && (
              <Link
                to="/profile"
                aria-label={t('nav.profile')}
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-accent hover:opacity-80"
              >
                <Avatar name={user.username} />
              </Link>
            )}
            <Button variant="ghost" onClick={handleLogout}>
              {t('nav.logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-4 py-6">{children}</main>

      {actionBar && (
        <div className="sticky bottom-0 border-t border-border bg-bg px-4 py-3">
          <div className="mx-auto max-w-[1080px]">{actionBar}</div>
        </div>
      )}
    </div>
  )
}
