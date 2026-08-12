// /trainer/trainees/:id/measurements/:mid — one entry, read-only (P7 §5.6 Q5).
// Same mono readout as the trainee detail, minus the owner Edit/Delete actions
// (the API forbids trainer mutation).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TrainerNav } from '../components/TrainerNav'
import { Card } from '../components/Card'
import { Spinner } from '../components/Spinner'
import { getMeasurement, type Measurement } from '../lib/measurements'
import { METRICS } from '../lib/metricMeta'
import { formatWithUnit, formatDecimal } from '../lib/format'
import { formatDate } from '../i18n'

export function TraineeMeasurementDetail() {
  const { t } = useTranslation()
  const { id, mid } = useParams()
  const traineeId = Number(id)
  const measurementId = Number(mid)
  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getMeasurement(measurementId)
      .then((m) => active && setMeasurement(m))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [measurementId])

  if (error) {
    return (
      <AppShell>
        <TrainerNav traineeId={traineeId} />
        <p className="font-sans text-sm text-danger">{t('detail.notFound')}</p>
      </AppShell>
    )
  }

  if (measurement === null) {
    return (
      <AppShell>
        <TrainerNav traineeId={traineeId} />
        <Spinner />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <TrainerNav traineeId={traineeId} />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {formatDate(measurement.measured_at)}
      </h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <table className="w-full">
            <tbody>
              {METRICS.filter((m) => m.key !== 'bmi').map((meta) => (
                <tr key={meta.key} className="border-b border-border last:border-0">
                  <th className="py-1.5 text-left font-sans text-sm font-normal text-muted">
                    {t(meta.labelKey)}
                  </th>
                  <td className="py-1.5 text-right font-mono text-text">
                    {formatWithUnit(
                      measurement[meta.key as keyof Measurement] as string | null,
                      meta.unit,
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <th className="py-1.5 text-left font-sans text-sm font-normal text-muted">
                  {t('metrics.bmi')}
                </th>
                <td className="py-1.5 text-right font-mono text-text">
                  {formatDecimal(measurement.bmi)}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        {measurement.photo_url && (
          <Card className="flex items-center justify-center">
            <img
              src={measurement.photo_url}
              alt={t('measurements.photoAlt')}
              className="max-h-96 w-full rounded-sm object-contain"
            />
          </Card>
        )}
      </div>
    </AppShell>
  )
}
