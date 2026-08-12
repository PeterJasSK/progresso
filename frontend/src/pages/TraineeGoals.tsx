// /trainer/trainees/:id/goals — the trainee's goals, view + toggle-complete
// (P7 §5.6, AC-5). The one goal write P7 adds: the trainer flips is_completed via
// PATCH /goals/:id. No add-goal form here (creation is trainee-only, P6).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TrainerNav } from '../components/TrainerNav'
import { GoalCard } from '../components/GoalCard'
import { Spinner } from '../components/Spinner'
import { getTrainee, type RosterEntry } from '../lib/trainees'
import { listGoals, toggleGoal, type Goal } from '../lib/goals'

export function TraineeGoals() {
  const { t } = useTranslation()
  const { id } = useParams()
  const traineeId = Number(id)
  const [trainee, setTrainee] = useState<RosterEntry | null>(null)
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [error, setError] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([getTrainee(traineeId), listGoals(traineeId)])
      .then(([tr, data]) => {
        if (!active) return
        setTrainee(tr)
        setGoals(data)
      })
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [traineeId])

  async function handleToggle(goal: Goal): Promise<void> {
    setTogglingId(goal.id)
    try {
      const updated = await toggleGoal(goal.id, !goal.is_completed)
      setGoals((current) =>
        current === null
          ? current
          : current.map((g) => (g.id === updated.id ? updated : g)),
      )
    } catch {
      setError(true)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <AppShell>
      <TrainerNav traineeId={traineeId} traineeName={trainee?.display_name} />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('nav.trainer.goals')}
      </h1>

      {error && <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>}
      {!error && goals === null && <Spinner />}
      {goals !== null && goals.length === 0 && (
        <p className="font-sans text-sm text-muted">{t('trainer.goals.empty')}</p>
      )}

      {goals !== null && goals.length > 0 && (
        <div className="flex flex-col gap-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onToggle={handleToggle}
              toggling={togglingId === goal.id}
            />
          ))}
        </div>
      )}
    </AppShell>
  )
}
