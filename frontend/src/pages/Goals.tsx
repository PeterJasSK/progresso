// /me/goals — list the trainee's goals and add a new one. Toggle-complete is P7.
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TraineeNav } from '../components/TraineeNav'
import { GoalCard } from '../components/GoalCard'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { ApiError } from '../lib/api'
import { createGoal, listGoals, type Goal, type GoalDirection } from '../lib/goals'
import { GOAL_METRICS, type MetricKey } from '../lib/metricMeta'

const selectClass =
  'w-full rounded-sm border border-border bg-surface px-3 py-2.5 font-sans text-text focus:border-accent dark:focus:shadow-glow'

export function Goals() {
  const { t } = useTranslation()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  const [metric, setMetric] = useState<MetricKey>(GOAL_METRICS[0].key)
  const [target, setTarget] = useState('')
  const [direction, setDirection] = useState<GoalDirection>('decrease')
  const [targetDate, setTargetDate] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  function load(): void {
    listGoals()
      .then(setGoals)
      .catch(() => setLoadError(true))
  }

  useEffect(load, [])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (submitting || target.trim() === '') return
    setSubmitting(true)
    setErrorKey(null)
    try {
      await createGoal({
        metric,
        target_value: Number.parseFloat(target),
        direction,
        target_date: targetDate || null,
        description: description.trim(),
      })
      setTarget('')
      setTargetDate('')
      setDescription('')
      load()
    } catch (err) {
      setErrorKey(err instanceof ApiError ? err.key : 'unknown')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <TraineeNav />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('goals.title')}
      </h1>

      <Card className="mb-6">
        <h2 className="mb-3 font-display text-lg font-bold text-heading">
          {t('goals.add.title')}
        </h2>
        {errorKey && (
          <p className="mb-3 font-sans text-sm text-danger">{t(`errors.${errorKey}`)}</p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-sans text-sm text-muted">{t('goals.add.metric')}</span>
              <select
                className={selectClass}
                value={metric}
                onChange={(e) => setMetric(e.target.value as MetricKey)}
              >
                {GOAL_METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {t(m.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-sm text-muted">{t('goals.add.direction')}</span>
              <select
                className={selectClass}
                value={direction}
                onChange={(e) => setDirection(e.target.value as GoalDirection)}
              >
                <option value="decrease">{t('goals.direction.decrease')}</option>
                <option value="increase">{t('goals.direction.increase')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-sm text-muted">{t('goals.add.target')}</span>
              <Input
                numeric
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-sm text-muted">
                {t('goals.add.date')}{' '}
                <span className="text-xs">({t('common.optional')})</span>
              </span>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-sans text-sm text-muted">
              {t('goals.add.note')}{' '}
              <span className="text-xs">({t('common.optional')})</span>
            </span>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={submitting || target.trim() === ''}>
            {submitting ? t('common.submitting') : t('goals.add.submit')}
          </Button>
        </form>
      </Card>

      {loadError && <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>}
      {!loadError && goals === null && <Spinner />}
      {goals !== null && goals.length === 0 && (
        <p className="font-sans text-sm text-muted">{t('goals.empty')}</p>
      )}
      {goals !== null && goals.length > 0 && (
        <div className="flex flex-col gap-3">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}
    </AppShell>
  )
}
