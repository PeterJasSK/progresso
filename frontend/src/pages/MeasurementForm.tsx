// /me/measurements/new (create) and /me/measurements/:id/edit (edit). The core
// capture form: numeric inputs + camera photo, mobile-first, primary CTA in the
// bottom action bar. Multipart POST/PATCH. Minimal required input (one value or a
// photo) so a weekly log is under 30 seconds.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TraineeNav } from '../components/TraineeNav'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { ApiError } from '../lib/api'
import {
  createMeasurement,
  getMeasurement,
  updateMeasurement,
} from '../lib/measurements'
import { VALUE_METRICS } from '../lib/metricMeta'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function MeasurementForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = id !== undefined
  const measurementId = editing ? Number(id) : null

  const [values, setValues] = useState<Record<string, string>>({})
  const [measuredAt, setMeasuredAt] = useState<string>(todayIso())
  const [photo, setPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState<boolean>(editing)
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  useEffect(() => {
    if (!editing || measurementId === null) return
    let active = true
    getMeasurement(measurementId)
      .then((m) => {
        if (!active) return
        const next: Record<string, string> = {}
        for (const meta of VALUE_METRICS) {
          const v = m[meta.key as keyof typeof m]
          if (v !== null && v !== undefined) next[meta.key] = String(v)
        }
        setValues(next)
        setMeasuredAt(m.measured_at)
      })
      .catch(() => active && setErrorKey('unknown'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [editing, measurementId])

  const hasAnyValue = useMemo(
    () => Object.values(values).some((v) => v.trim() !== '') || photo !== null,
    [values, photo],
  )

  function setValue(key: string, value: string): void {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!hasAnyValue || submitting) return
    setSubmitting(true)
    setErrorKey(null)

    const form = new FormData()
    form.append('unit_system', 'metric')
    form.append('measured_at', measuredAt)
    for (const meta of VALUE_METRICS) {
      const raw = values[meta.key]
      if (raw !== undefined && raw.trim() !== '') form.append(meta.key, raw.trim())
    }
    if (photo) form.append('photo', photo)

    try {
      if (editing && measurementId !== null) {
        await updateMeasurement(measurementId, form)
        navigate(`/me/measurements/${measurementId}`)
      } else {
        await createMeasurement(form)
        navigate('/me/measurements')
      }
    } catch (err) {
      setErrorKey(err instanceof ApiError ? err.key : 'unknown')
      setSubmitting(false)
    }
  }

  const submit = (
    <Button
      type="submit"
      form="measurement-form"
      className="w-full"
      disabled={!hasAnyValue || submitting}
    >
      {submitting ? t('common.submitting') : editing ? t('capture.save') : t('capture.submit')}
    </Button>
  )

  if (loading) {
    return (
      <AppShell>
        <TraineeNav />
        <Spinner />
      </AppShell>
    )
  }

  return (
    <AppShell actionBar={submit}>
      <TraineeNav />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {editing ? t('capture.editTitle') : t('capture.title')}
      </h1>

      {errorKey && (
        <p className="mb-4 font-sans text-sm text-danger">{t(`errors.${errorKey}`)}</p>
      )}

      <form id="measurement-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-sans text-sm text-muted">{t('capture.measuredAt')}</span>
          <Input
            type="date"
            value={measuredAt}
            max={todayIso()}
            onChange={(e) => setMeasuredAt(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {VALUE_METRICS.map((meta) => (
            <label key={meta.key} className="flex flex-col gap-1">
              <span className="font-sans text-sm text-muted">
                {t(meta.labelKey)} {meta.unit && <span>({meta.unit})</span>}
              </span>
              <Input
                numeric
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="—"
                value={values[meta.key] ?? ''}
                onChange={(e) => setValue(meta.key, e.target.value)}
              />
            </label>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-sans text-sm text-muted">
            {t('capture.photo')}{' '}
            <span className="text-xs">({t('common.optional')})</span>
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="font-sans text-sm text-text file:mr-3 file:rounded-sm file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:font-sans file:text-sm file:text-accent"
          />
          {photo && (
            <img
              src={URL.createObjectURL(photo)}
              alt={t('capture.photoPreview')}
              className="mt-2 h-40 w-40 rounded-sm object-cover"
            />
          )}
        </label>
      </form>
    </AppShell>
  )
}
