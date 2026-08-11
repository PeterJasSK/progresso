// Authenticated frame: topbar (logo, theme + language toggles, logout) + centered
// max-width content column, mobile-first. actionBar is a slot P6 fills with its primary
// CTA on mobile. All chrome labels come through i18n.
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
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
          <span className="font-display text-lg font-bold text-heading">
            <span className="text-accent">◆</span> {t('app.name').toUpperCase()}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            {user && <Avatar name={user.username} />}
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
