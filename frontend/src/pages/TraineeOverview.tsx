// /trainer/trainees/:id — one trainee's summary (P7 §5.6). Hero weight stat +
// a couple of secondary tiles from the series, plus the trainee nav quick-links
// to their measurements / progress / photos / goals. Read-only; chat is P8.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TrainerNav } from '../components/TrainerNav'
import { StatTile } from '../components/StatTile'
import { Spinner } from '../components/Spinner'
import { getTrainee, type RosterEntry } from '../lib/trainees'
import { getSeries, type Series, type MetricSummary } from '../lib/measurements'
import { METRIC_BY_KEY, type MetricKey } from '../lib/metricMeta'
import { formatWithUnit } from '../lib/format'
import { formatDate } from '../i18n'

const SECONDARY: MetricKey[] = ['waist', 'chest']

function trendOf(summary?: MetricSummary): 'up' | 'down' | 'flat' {
  return summary?.trend ?? 'flat'
}

function deltaText(summary: MetricSummary | undefined, unit: string): string | undefined {
  if (!summary || summary.delta === null) return undefined
  const sign = summary.delta > 0 ? '+' : summary.delta < 0 ? '−' : ''
  return `${sign}${formatWithUnit(Math.abs(summary.delta), unit)}`
}

export function TraineeOverview() {
  const { t } = useTranslation()
  const { id } = useParams()
  const traineeId = Number(id)
  const [trainee, setTrainee] = useState<RosterEntry | null>(null)
  const [series, setSeries] = useState<Series | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getTrainee(traineeId), getSeries(traineeId)])
      .then(([tr, s]) => {
        if (!active) return
        setTrainee(tr)
        setSeries(s)
      })
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [traineeId])

  if (error) {
    return (
      <AppShell>
        <TrainerNav traineeId={traineeId} />
        <p className="font-sans text-sm text-danger">{t('trainer.overview.notFound')}</p>
      </AppShell>
    )
  }

  if (trainee === null || series === null) {
    return (
      <AppShell>
        <TrainerNav traineeId={traineeId} />
        <Spinner />
      </AppShell>
    )
  }

  const hasData = series.dates.length > 0
  const weightMeta = METRIC_BY_KEY.weight

  return (
    <AppShell>
      <TrainerNav traineeId={traineeId} traineeName={trainee.display_name} />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {trainee.display_name}
      </h1>

      {!hasData && (
        <p className="font-sans text-sm text-muted">{t('trainer.overview.noData')}</p>
      )}

      {hasData && (
        <>
          <p className="mb-4 font-sans text-sm text-muted">
            {t('trainer.roster.lastLogged')}{' '}
            <span className="font-mono text-text">
              {formatDate(series.dates[series.dates.length - 1])}
            </span>
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label={t(weightMeta.labelKey)}
              value={formatWithUnit(series.summary.weight?.latest ?? null, weightMeta.unit)}
              delta={deltaText(series.summary.weight, weightMeta.unit)}
              deltaLabel={t('home.trainee.delta')}
              trend={trendOf(series.summary.weight)}
            />
            {SECONDARY.map((key) => {
              const meta = METRIC_BY_KEY[key]
              const summary = series.summary[key]
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
