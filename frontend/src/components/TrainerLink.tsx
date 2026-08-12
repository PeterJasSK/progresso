// "Your trainer" — self-service linking on the trainee home (P7 §5.3b). Shows the
// current trainer (or "no trainer"), a picker to link one (from GET /auth/trainers),
// and an unlink action. PATCH /auth/me sets the caller's own head_trainer, then the
// auth context refreshes so the label updates.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from './Card'
import { Button } from './Button'
import { useAuth } from '../auth/useAuth'
import { api, ApiError } from '../lib/api'
import { linkTrainer } from '../lib/me'

interface TrainerOption {
  id: number
  display_name: string
}

export function TrainerLink() {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const [trainers, setTrainers] = useState<TrainerOption[]>([])
  const [choice, setChoice] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<TrainerOption[]>('/auth/trainers')
      .then(setTrainers)
      .catch(() => setTrainers([]))
  }, [])

  if (!user) return null
  const hasTrainer = user.head_trainer != null

  async function apply(trainerId: number | null): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      await linkTrainer(trainerId)
      await refreshUser()
      setChoice('')
    } catch (err) {
      const key = err instanceof ApiError ? err.key : 'unknown'
      setError(t(`errors.${key}`, { defaultValue: t('errors.unknown') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4 flex flex-col gap-3">
      <div className="font-sans text-sm text-text">
        {t('home.trainer.yourTrainer')}:{' '}
        <span className="font-mono text-text">
          {hasTrainer ? user.head_trainer_name : t('home.trainer.none')}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 font-sans text-xs text-muted">
          {t('home.trainer.pick')}
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={busy}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2 font-sans text-text focus:border-accent"
          >
            <option value="">{t('home.trainer.pickPlaceholder')}</option>
            {trainers.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.display_name}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={busy || choice === ''} onClick={() => apply(Number(choice))}>
          {t('home.trainer.link')}
        </Button>
        {hasTrainer && (
          <Button variant="ghost" disabled={busy} onClick={() => apply(null)}>
            {t('home.trainer.unlink')}
          </Button>
        )}
      </div>

      {error && (
        <p className="font-sans text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}
