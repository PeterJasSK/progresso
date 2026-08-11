// One goal as a card: metric label + target (mono + unit), direction arrow,
// optional deadline, status pill, and the note. Status toggle is P7.
import { useTranslation } from 'react-i18next'
import { Card } from './Card'
import { Pill } from './Pill'
import type { Goal } from '../lib/goals'
import { METRIC_BY_KEY } from '../lib/metricMeta'
import { formatWithUnit } from '../lib/format'
import { formatDate } from '../i18n'

interface GoalCardProps {
  goal: Goal
}

export function GoalCard({ goal }: GoalCardProps) {
  const { t } = useTranslation()
  const meta = METRIC_BY_KEY[goal.metric]
  const arrow = goal.direction === 'increase' ? '▲' : '▼'

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-lg font-bold text-heading">
          {t(meta.labelKey)}
        </h3>
        <Pill variant={goal.is_completed ? 'ok' : 'accent'}>
          {goal.is_completed ? t('goals.status.completed') : t('goals.status.active')}
        </Pill>
      </div>
      <div className="font-mono text-sm text-text">
        <span className="text-muted">{arrow}</span>{' '}
        {t('goals.targetTo')} {formatWithUnit(goal.target_value, meta.unit)}
      </div>
      {goal.target_date && (
        <div className="font-mono text-xs text-muted">
          {t('goals.by')} {formatDate(goal.target_date)}
        </div>
      )}
      {goal.description && (
        <p className="font-sans text-sm text-muted">{goal.description}</p>
      )}
    </Card>
  )
}
