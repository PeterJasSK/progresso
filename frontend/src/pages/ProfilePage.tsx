// /profile (P9) — opened from the header avatar. Consolidates the self-service
// surfaces that used to sit on the home screens: the once-set profile height
// (trainee only, feeds BMI), the trainer connection (trainee only), and data
// export/delete (both roles). Role-conditional: a trainer sees only the data
// section.
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/useAuth'
import { AppShell } from '../components/AppShell'
import { TrainerLink } from '../components/TrainerLink'
import { DataSection } from '../components/DataSection'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { ApiError } from '../lib/api'
import { updateProfile } from '../lib/me'
import { roleHome } from '../auth/AuthProvider'

function HeightSection() {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const [value, setValue] = useState(user?.height_cm ?? '')
  const [saving, setSaving] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setErrorKey(null)
    setSaved(false)
    try {
      const trimmed = value.trim()
      await updateProfile({ height_cm: trimmed === '' ? null : Number.parseFloat(trimmed) })
      await refreshUser()
      setSaved(true)
    } catch (err) {
      setErrorKey(err instanceof ApiError ? err.key : 'unknown')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 font-display text-lg font-bold text-heading">
        {t('profile.height.title')}
      </h2>
      <p className="mb-3 font-sans text-sm text-muted">{t('profile.height.description')}</p>
      {errorKey && (
        <p className="mb-3 font-sans text-sm text-danger">{t(`errors.${errorKey}`)}</p>
      )}
      {saved && !errorKey && (
        <p className="mb-3 font-sans text-sm text-success">{t('profile.height.saved')}</p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-sans text-sm text-muted">
            {t('profile.height.label')} <span className="text-xs">(cm)</span>
          </span>
          <Input
            numeric
            type="number"
            step="0.1"
            min="50"
            max="250"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <Button type="submit" disabled={saving}>
          {saving ? t('common.submitting') : t('profile.height.save')}
        </Button>
      </form>
    </Card>
  )
}

export function ProfilePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isTrainee = user?.role === 'trainee'

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-heading">
          {t('profile.title')}
        </h1>
        {user && (
          <Link
            to={roleHome(user.role)}
            className="ml-auto font-sans text-sm text-accent hover:underline"
          >
            {t('profile.back')}
          </Link>
        )}
      </div>

      {isTrainee && <HeightSection />}
      {isTrainee && <TrainerLink />}

      <DataSection />
    </AppShell>
  )
}
