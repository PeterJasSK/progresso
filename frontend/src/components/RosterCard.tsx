// One roster entry as a card (P7 §5.6): avatar, display name, last-logged date
// (mono), a weight trend arrow + delta, and an overdue pill when the trainee has
// not logged in the last 7 days (§11 Q4, client-side). Links to the overview.
// Values render in JetBrains Mono; no hardcoded hex (token utilities only).
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from './Card'
import { Pill } from './Pill'
import { Avatar } from './Avatar'
import type { RosterEntry } from '../lib/trainees'
import { formatWithUnit } from '../lib/format'
import { formatDate } from '../i18n'

const OVERDUE_DAYS = 7

function isOverdue(lastMeasuredAt: string | null): boolean {
  if (lastMeasuredAt === null) return true
  const ageDays = (Date.now() - new Date(lastMeasuredAt).getTime()) / 86_400_000
  return ageDays > OVERDUE_DAYS
}

const trendArrow: Record<'up' | 'down' | 'flat', string> = {
  up: '▲',
  down: '▼',
  flat: '→',
}

const trendColor: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-muted',
}

interface RosterCardProps {
  entry: RosterEntry
}

export function RosterCard({ entry }: RosterCardProps) {
  const { t } = useTranslation()
  const overdue = isOverdue(entry.last_measured_at)
  const trend = entry.trend ?? 'flat'

  return (
    <Link to={`/trainer/trainees/${entry.id}`} className="block">
      <Card className="flex items-center gap-4 transition-colors hover:border-accent">
        <Avatar name={entry.display_name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg font-bold text-heading">
              {entry.display_name}
            </h3>
            {overdue && <Pill variant="warn">{t('trainer.roster.overdue')}</Pill>}
          </div>
          <div className="mt-1 font-sans text-xs text-muted">
            {t('trainer.roster.lastLogged')}{' '}
            <span className="font-mono text-text">
              {entry.last_measured_at
                ? formatDate(entry.last_measured_at)
                : t('trainer.roster.never')}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-sans text-xs text-muted">{t('metrics.weight')}</div>
          <div className="font-mono text-text">
            {formatWithUnit(entry.latest_value, 'kg')}
          </div>
          {entry.delta !== null && (
            <div className={`font-mono text-xs ${trendColor[trend]}`}>
              {trendArrow[trend]}{' '}
              {formatWithUnit(Math.abs(entry.delta), 'kg')}
            </div>
          )}
        </div>
      </Card>
    </Link>
  )
}
