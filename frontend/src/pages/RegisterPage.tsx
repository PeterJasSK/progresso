// Open self-registration (P1 §0): username, password, role choice, and — for trainees —
// an optional trainer picker from GET /auth/trainers. POST /auth/register auto-logs-in on
// 201; field error keys map through i18n. Redirects away if already authenticated.
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/useAuth'
import { roleHome, type Role } from '../auth/AuthProvider'
import { api, ApiError } from '../lib/api'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { ThemeToggle } from '../components/ThemeToggle'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

interface TrainerOption {
  id: number
  display_name: string
}

export function RegisterPage() {
  const { t } = useTranslation()
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('trainee')
  const [trainerId, setTrainerId] = useState<string>('')
  const [trainers, setTrainers] = useState<TrainerOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get<TrainerOption[]>('/auth/trainers')
      .then(setTrainers)
      .catch(() => setTrainers([]))
  }, [])

  if (user) return <Navigate to={roleHome(user.role)} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const u = await register({
        username,
        password,
        role,
        trainer_id: role === 'trainee' && trainerId ? Number(trainerId) : null,
      })
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
        <h1 className="mb-6 font-display text-2xl font-bold text-heading">
          <span className="text-accent">◆</span> {t('app.name').toUpperCase()}
        </h1>
        <Card>
          <h2 className="mb-4 font-display text-xl text-heading">{t('auth.register.title')}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 font-sans text-sm text-text">
              {t('auth.register.username')}
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="flex flex-col gap-1 font-sans text-sm text-text">
              {t('auth.register.password')}
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="flex flex-col gap-1 font-sans text-sm text-text">
              {t('auth.register.role')}
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 font-sans text-text focus:border-accent"
              >
                <option value="trainee">{t('auth.register.roleTrainee')}</option>
                <option value="trainer">{t('auth.register.roleTrainer')}</option>
              </select>
            </label>
            {role === 'trainee' && (
              <label className="flex flex-col gap-1 font-sans text-sm text-text">
                {t('auth.register.trainer')}{' '}
                <span className="text-muted">({t('common.optional')})</span>
                <select
                  value={trainerId}
                  onChange={(e) => setTrainerId(e.target.value)}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 font-sans text-text focus:border-accent"
                >
                  <option value="">{t('auth.register.trainerNone')}</option>
                  {trainers.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.display_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && (
              <p className="font-sans text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? t('common.submitting') : t('auth.register.submit')}
            </Button>
          </form>
          <p className="mt-4 font-sans text-sm text-muted">
            {t('auth.register.haveAccount')}{' '}
            <Link to="/login" className="text-accent hover:underline">
              {t('auth.register.loginLink')}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
