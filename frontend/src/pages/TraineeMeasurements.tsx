// /trainer/trainees/:id/measurements — the trainee's entries, newest-first,
// read-only (P7 §5.6). No create/edit/delete: the API forbids trainer mutation.
// Cards link to the read-only trainer detail sub-route.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TrainerNav } from '../components/TrainerNav'
import { MeasurementCard } from '../components/MeasurementCard'
import { Spinner } from '../components/Spinner'
import { getTrainee, type RosterEntry } from '../lib/trainees'
import { listMeasurements, type Measurement } from '../lib/measurements'

export function TraineeMeasurements() {
  const { t } = useTranslation()
  const { id } = useParams()
  const traineeId = Number(id)
  const [trainee, setTrainee] = useState<RosterEntry | null>(null)
  const [items, setItems] = useState<Measurement[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getTrainee(traineeId), listMeasurements(traineeId)])
      .then(([tr, data]) => {
        if (!active) return
        setTrainee(tr)
        setItems(data)
      })
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [traineeId])

  return (
    <AppShell>
      <TrainerNav traineeId={traineeId} traineeName={trainee?.display_name} />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('nav.trainer.measurements')}
      </h1>

      {error && <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>}
      {!error && items === null && <Spinner />}
      {items !== null && items.length === 0 && (
        <p className="font-sans text-sm text-muted">{t('trainer.measurements.empty')}</p>
      )}

      {items !== null && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((m) => (
            <MeasurementCard
              key={m.id}
              measurement={m}
              to={`/trainer/trainees/${traineeId}/measurements/${m.id}`}
            />
          ))}
        </div>
      )}
    </AppShell>
  )
}
