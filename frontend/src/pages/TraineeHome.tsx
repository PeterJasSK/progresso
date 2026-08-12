// /me — trainee dashboard (P9). Latest measurement as hero + secondary stat
// tiles, small per-metric graphs over history, and a "log measurement" button by
// the headline (overdue nudge: no entry in the last 7 days). Trainer link + data
// export/delete moved to /profile.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/useTheme'
import { AppShell } from '../components/AppShell'
import { TraineeNav } from '../components/TraineeNav'
import { Card } from '../components/Card'
import { MetricChart } from '../components/MetricChart'
import { StatTile } from '../components/StatTile'
import { Button } from '../components/Button'
import { Pill } from '../components/Pill'
import { Spinner } from '../components/Spinner'
import { getSeries, type Series, type MetricSummary } from '../lib/measurements'
import { METRIC_BY_KEY, type MetricKey } from '../lib/metricMeta'
import { formatWithUnit } from '../lib/format'
import { formatDate } from '../i18n'

const OVERDUE_DAYS = 7
// Metrics that get a compact chart on the dashboard, when they have ≥2 points.
const CHART_METRICS: MetricKey[] = ['weight', 'waist', 'chest']

function isOverdue(dates: string[]): boolean {
  if (dates.length === 0) return true
  const latest = new Date(dates[dates.length - 1])
  const ageDays = (Date.now() - latest.getTime()) / 86_400_000
  return ageDays > OVERDUE_DAYS
}

function trendOf(summary?: MetricSummary): 'up' | 'down' | 'flat' {
  return summary?.trend ?? 'flat'
}

function deltaText(summary: MetricSummary | undefined, unit: string): string | undefined {
  if (!summary || summary.delta === null) return undefined
  const sign = summary.delta > 0 ? '+' : summary.delta < 0 ? '−' : ''
  return `${sign}${formatWithUnit(Math.abs(summary.delta), unit)}`
}

// Which secondary metrics to show under the hero, when present.
const SECONDARY: MetricKey[] = ['waist', 'chest']

export function TraineeHome() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [series, setSeries] = useState<Series | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getSeries()
      .then((s) => active && setSeries(s))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <AppShell>
        <TraineeNav />
        <Spinner />
      </AppShell>
    )
  }

  const hasData = series !== null && series.dates.length > 0
  const weightMeta = METRIC_BY_KEY.weight
  // Charts need ≥2 points to draw a line; the rest fall back to a hint.
  const chartable = hasData
    ? CHART_METRICS.filter((key) => (series!.metrics[key]?.filter((v) => v !== null).length ?? 0) >= 2)
    : []

  return (
    <AppShell>
      <TraineeNav />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-heading">
          {t('home.trainee.title')}
        </h1>
        {hasData && isOverdue(series!.dates) && (
          <Pill variant="warn">{t('home.overdue')}</Pill>
        )}
        <Button
          className="ml-auto"
          onClick={() => navigate('/me/measurements/new')}
        >
          {t('home.logThisWeek')}
        </Button>
      </div>

      {error && (
        <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>
      )}

      {!hasData && !error && (
        <p className="font-sans text-sm text-muted">{t('home.empty')}</p>
      )}

      {hasData && (
        <>
          <p className="mb-4 font-sans text-sm text-muted">
            {t('home.lastLogged')}{' '}
            <span className="font-mono text-text">
              {formatDate(series!.dates[series!.dates.length - 1])}
            </span>
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label={t(weightMeta.labelKey)}
              value={formatWithUnit(series!.summary.weight?.latest ?? null, weightMeta.unit)}
              delta={deltaText(series!.summary.weight, weightMeta.unit)}
              deltaLabel={t('home.trainee.delta')}
              trend={trendOf(series!.summary.weight)}
            />
            {SECONDARY.map((key) => {
              const meta = METRIC_BY_KEY[key]
              const summary = series!.summary[key]
              if (!summary) return null
              return (
                <StatTile
                  key={key}
                  label={t(meta.labelKey)}
                  value={formatWithUnit(summary.latest, meta.unit)}
                  delta={deltaText(summary, meta.unit)}
                  deltaLabel={t('home.trainee.delta')}
                  trend={trendOf(summary)}
                />
              )
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-heading">
              {t('home.charts.title')}
            </h2>
            <Link
              to="/me/progress"
              className="font-sans text-sm text-accent hover:underline"
            >
              {t('home.charts.viewAll')}
            </Link>
          </div>
          {chartable.length === 0 ? (
            <p className="mt-2 font-sans text-sm text-muted">
              {t('progress.needMore')}
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {chartable.map((key) => {
                const meta = METRIC_BY_KEY[key]
                return (
                  <Card key={key}>
                    <p className="mb-2 font-sans text-sm text-muted">
                      {t(meta.labelKey)}
                    </p>
                    <MetricChart
                      labels={series!.dates}
                      data={series!.metrics[key]!}
                      colorVar={meta.colorVar}
                      label={t(meta.labelKey)}
                      theme={theme}
                      size="compact"
                    />
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
