// /me/measurements — the trainee's own entries, newest-first, as cards.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TraineeNav } from '../components/TraineeNav'
import { MeasurementCard } from '../components/MeasurementCard'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { listMeasurements, type Measurement } from '../lib/measurements'

export function MeasurementsList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [items, setItems] = useState<Measurement[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    listMeasurements()
      .then((data) => active && setItems(data))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [])

  const cta = (
    <Button className="w-full" onClick={() => navigate('/me/measurements/new')}>
      {t('measurements.logNew')}
    </Button>
  )

  return (
    <AppShell actionBar={cta}>
      <TraineeNav />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('measurements.title')}
      </h1>

      {error && <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>}
      {!error && items === null && <Spinner />}
      {items !== null && items.length === 0 && (
        <p className="font-sans text-sm text-muted">{t('measurements.empty')}</p>
      )}

      {items !== null && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((m) => (
            <MeasurementCard key={m.id} measurement={m} />
          ))}
        </div>
      )}
    </AppShell>
  )
}
