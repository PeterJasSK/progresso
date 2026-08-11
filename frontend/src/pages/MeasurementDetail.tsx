// /me/measurements/:id — one entry: every value as a mono readout, BMI, the full
// photo, and owner actions (edit + delete). Delete cleans the blob server-side.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TraineeNav } from '../components/TraineeNav'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import {
  deleteMeasurement,
  getMeasurement,
  type Measurement,
} from '../lib/measurements'
import { METRICS } from '../lib/metricMeta'
import { formatWithUnit, formatDecimal } from '../lib/format'
import { formatDate } from '../i18n'

export function MeasurementDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const measurementId = Number(id)

  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  const [error, setError] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    getMeasurement(measurementId)
      .then((m) => active && setMeasurement(m))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [measurementId])

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('detail.confirmDelete'))) return
    setDeleting(true)
    try {
      await deleteMeasurement(measurementId)
      navigate('/me/measurements')
    } catch {
      setError(true)
      setDeleting(false)
    }
  }

  if (error) {
    return (
      <AppShell>
        <TraineeNav />
        <p className="font-sans text-sm text-danger">{t('detail.notFound')}</p>
      </AppShell>
    )
  }

  if (measurement === null) {
    return (
      <AppShell>
        <TraineeNav />
        <Spinner />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <TraineeNav />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-heading">
          {formatDate(measurement.measured_at)}
        </h1>
      </div>

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

      <div className="mt-6 flex gap-3">
        <Button
          variant="ghost"
          onClick={() => navigate(`/me/measurements/${measurementId}/edit`)}
        >
          {t('detail.edit')}
        </Button>
        <Button variant="ghost" disabled={deleting} onClick={handleDelete}>
          {t('detail.delete')}
        </Button>
      </div>
    </AppShell>
  )
}
