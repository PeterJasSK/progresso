// /me/goals — list the trainee's goals and add a new one (via the shared
// GoalForm). Toggle-complete is P7 (trainer/owner). Create is self here.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TraineeNav } from '../components/TraineeNav'
import { GoalCard } from '../components/GoalCard'
import { GoalForm } from '../components/GoalForm'
import { Spinner } from '../components/Spinner'
import { listGoals, type Goal } from '../lib/goals'

export function Goals() {
  const { t } = useTranslation()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  function load(): void {
    listGoals()
      .then(setGoals)
      .catch(() => setLoadError(true))
  }

  useEffect(load, [])

  return (
    <AppShell>
      <TraineeNav />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('goals.title')}
      </h1>

      <GoalForm onCreated={load} />

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
