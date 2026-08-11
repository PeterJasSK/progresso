// /me — trainee home. Latest measurement as a hero stat tile, a trend snapshot,
// and a "log this week" CTA (nudged when overdue: no entry in the last 7 days).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TraineeNav } from '../components/TraineeNav'
import { StatTile } from '../components/StatTile'
import { Button } from '../components/Button'
import { Pill } from '../components/Pill'
import { Spinner } from '../components/Spinner'
import { getSeries, type Series, type MetricSummary } from '../lib/measurements'
import { METRIC_BY_KEY, type MetricKey } from '../lib/metricMeta'
import { formatWithUnit } from '../lib/format'
import { formatDate } from '../i18n'

const OVERDUE_DAYS = 7

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

  const cta = (
    <Button className="w-full" onClick={() => navigate('/me/measurements/new')}>
      {t('home.logThisWeek')}
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

  const hasData = series !== null && series.dates.length > 0
  const weightMeta = METRIC_BY_KEY.weight

  return (
    <AppShell actionBar={cta}>
      <TraineeNav />
      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-heading">
          {t('home.trainee.title')}
        </h1>
        {hasData && isOverdue(series!.dates) && (
          <Pill variant="warn">{t('home.overdue')}</Pill>
        )}
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
        </>
      )}
    </AppShell>
  )
}
