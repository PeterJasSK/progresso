// One measurement entry as a card: date (mono), a couple of key values, and a
// thumbnail if present. Links to the detail route. Values render in JetBrains Mono.
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from './Card'
import type { Measurement } from '../lib/measurements'
import { formatWithUnit } from '../lib/format'
import { formatDate } from '../i18n'

interface MeasurementCardProps {
  measurement: Measurement
}

export function MeasurementCard({ measurement }: MeasurementCardProps) {
  const { t } = useTranslation()
  return (
    <Link to={`/me/measurements/${measurement.id}`} className="block">
      <Card className="flex items-center gap-4 transition-colors hover:border-accent">
        {measurement.thumbnail_url ? (
          <img
            src={measurement.thumbnail_url}
            alt={t('measurements.photoAlt')}
            className="h-16 w-16 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm bg-surface font-mono text-xs text-muted">
            {t('measurements.noPhoto')}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm text-muted">
            {formatDate(measurement.measured_at)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-sans text-xs text-muted">
              {t('metrics.weight')}:{' '}
              <span className="font-mono text-text">
                {formatWithUnit(measurement.weight, 'kg')}
              </span>
            </span>
            <span className="font-sans text-xs text-muted">
              {t('metrics.waist')}:{' '}
              <span className="font-mono text-text">
                {formatWithUnit(measurement.waist, 'cm')}
              </span>
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}
