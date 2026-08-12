// Shared progress body (P7 §5.6): metric selector over the metrics present in the
// series, the selected metric as a brand-colored line with mono ticks, and a
// summary strip (latest / delta / trend). Consumed by the trainee `/me/progress`
// screen and the trainer `/trainer/trainees/:id/progress` screen — the only
// difference is which user's series it fetches and which nav it wraps in (§11 Q7).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from './AppShell'
import { MetricChart } from './MetricChart'
import { StatTile } from './StatTile'
import { Card } from './Card'
import { Spinner } from './Spinner'
import { useTheme } from '../theme/useTheme'
import { getSeries, type Series } from '../lib/measurements'
import { METRIC_BY_KEY, METRICS, type MetricKey } from '../lib/metricMeta'
import { formatWithUnit } from '../lib/format'

interface ProgressViewProps {
  // Whose series to chart; omit for the caller's own (trainee self).
  userId?: number
  // The nav chrome to render at the top (TraineeNav or TrainerNav).
  nav: ReactNode
}

export function ProgressView({ userId, nav }: ProgressViewProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [series, setSeries] = useState<Series | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<MetricKey | null>(null)

  useEffect(() => {
    let active = true
    getSeries(userId)
      .then((s) => {
        if (!active) return
        setSeries(s)
        // Default to the first metric present, preferring weight.
        const present = METRICS.map((m) => m.key).filter((k) => s.metrics[k])
        setSelected(present.includes('weight') ? 'weight' : (present[0] ?? null))
      })
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [userId])

  const presentMetrics = useMemo(
    () => (series ? METRICS.filter((m) => series.metrics[m.key]) : []),
    [series],
  )

  if (error) {
    return (
      <AppShell>
        {nav}
        <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>
      </AppShell>
    )
  }

  if (series === null) {
    return (
      <AppShell>
        {nav}
        <Spinner />
      </AppShell>
    )
  }

  const canChart = series.dates.length >= 2 && selected !== null
  const meta = selected ? METRIC_BY_KEY[selected] : null
  const summary = selected ? series.summary[selected] : undefined

  return (
    <AppShell>
      {nav}
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('progress.title')}
      </h1>

      {presentMetrics.length === 0 && (
        <p className="font-sans text-sm text-muted">{t('progress.empty')}</p>
      )}

      {presentMetrics.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {presentMetrics.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelected(m.key)}
                className={
                  'rounded-pill border px-3 py-1 font-sans text-sm font-medium transition-colors ' +
                  (selected === m.key
                    ? 'border-accent bg-surface text-accent'
                    : 'border-border text-muted hover:text-text')
                }
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          {meta && summary && (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile
                label={t(meta.labelKey)}
                value={formatWithUnit(summary.latest, meta.unit)}
                delta={
                  summary.delta === null
                    ? undefined
                    : `${summary.delta > 0 ? '+' : summary.delta < 0 ? '−' : ''}${formatWithUnit(Math.abs(summary.delta), meta.unit)}`
                }
                trend={summary.trend ?? 'flat'}
              />
            </div>
          )}

          {canChart && meta ? (
            <Card>
              <MetricChart
                labels={series.dates}
                data={series.metrics[meta.key] ?? []}
                colorVar={meta.colorVar}
                label={t(meta.labelKey)}
                theme={theme}
              />
            </Card>
          ) : (
            <p className="font-sans text-sm text-muted">{t('progress.needMore')}</p>
          )}
        </>
      )}
    </AppShell>
  )
}
