// Sign-in screen. POST /auth/login on submit; on success redirect to role home; on
// failure map the backend error key through i18n. Pre-auth language + theme toggles in
// the corner (epic Q5). Redirects away if already authenticated. All strings via i18n.
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/useAuth'
import { roleHome } from '../auth/AuthProvider'
import { ApiError } from '../lib/api'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { ThemeToggle } from '../components/ThemeToggle'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

export function LoginPage() {
  const { t } = useTranslation()
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={roleHome(user.role)} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const u = await login(username, password)
      navigate(roleHome(u.role), { replace: true })
    } catch (err) {
      const key = err instanceof ApiError ? err.key : 'unknown'
      setError(t(`errors.${key}`, { defaultValue: t('errors.unknown') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bgdeep px-4">
      <div className="mx-auto flex max-w-[1080px] justify-end gap-2 py-4">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-sm pt-8">
        <h1 className="mb-1 font-display text-2xl font-bold text-heading">
          <span className="text-accent">◆</span> {t('app.name').toUpperCase()}
        </h1>
        <p className="mb-6 font-sans text-sm text-muted">{t('app.tagline')}</p>
        <Card>
          <h2 className="mb-4 font-display text-xl text-heading">{t('auth.login.title')}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 font-sans text-sm text-text">
              {t('auth.login.username')}
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="flex flex-col gap-1 font-sans text-sm text-text">
              {t('auth.login.password')}
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p className="font-sans text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? t('common.submitting') : t('auth.login.submit')}
            </Button>
          </form>
          <p className="mt-4 font-sans text-sm text-muted">
            {t('auth.login.noAccount')}{' '}
            <Link to="/register" className="text-accent hover:underline">
              {t('auth.login.registerLink')}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
