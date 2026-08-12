// /trainer/trainees/:id/photos — photo compare (P7 §5.6, AC-3 / D1). Two date
// selectors over the trainee's dated photos, defaulting to oldest-left /
// newest-right (natural before/after), shown side-by-side (stacked on mobile).
// Full-resolution bytes come straight from the Blob public URL. No overlay/slider
// (D2 is post-MVP).
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TrainerNav } from '../components/TrainerNav'
import { Card } from '../components/Card'
import { Spinner } from '../components/Spinner'
import { getTrainee, type RosterEntry } from '../lib/trainees'
import { listPhotos, type Measurement } from '../lib/measurements'
import { formatDate } from '../i18n'

// One photographed entry, oldest first (before/after reads left-to-right).
function byMeasuredAtAsc(a: Measurement, b: Measurement): number {
  return a.measured_at.localeCompare(b.measured_at)
}

interface PhotoPaneProps {
  photos: Measurement[]
  selectedId: number | null
  onSelect: (id: number) => void
  label: string
  t: (key: string) => string
}

function PhotoPane({ photos, selectedId, onSelect, label, t }: PhotoPaneProps) {
  const selected = photos.find((p) => p.id === selectedId) ?? null
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 font-sans text-sm text-text">
        {label}
        <select
          value={selectedId ?? ''}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="w-full rounded-sm border border-border bg-surface px-3 py-2.5 font-mono text-text focus:border-accent"
        >
          {photos.map((p) => (
            <option key={p.id} value={p.id}>
              {formatDate(p.measured_at)}
            </option>
          ))}
        </select>
      </label>
      <Card className="flex items-center justify-center">
        {selected ? (
          <img
            src={selected.photo_url}
            alt={t('measurements.photoAlt')}
            className="max-h-[28rem] w-full rounded-sm object-contain"
          />
        ) : (
          <span className="font-sans text-sm text-muted">
            {t('trainer.photos.pick')}
          </span>
        )}
      </Card>
    </div>
  )
}

export function PhotoCompare() {
  const { t } = useTranslation()
  const { id } = useParams()
  const traineeId = Number(id)
  const [trainee, setTrainee] = useState<RosterEntry | null>(null)
  const [photos, setPhotos] = useState<Measurement[] | null>(null)
  const [error, setError] = useState(false)
  const [leftId, setLeftId] = useState<number | null>(null)
  const [rightId, setRightId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([getTrainee(traineeId), listPhotos(traineeId)])
      .then(([tr, data]) => {
        if (!active) return
        setTrainee(tr)
        const sorted = [...data].sort(byMeasuredAtAsc)
        setPhotos(sorted)
        if (sorted.length > 0) {
          setLeftId(sorted[0].id)
          setRightId(sorted[sorted.length - 1].id)
        }
      })
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [traineeId])

  const sortedPhotos = useMemo(() => photos ?? [], [photos])

  return (
    <AppShell>
      <TrainerNav traineeId={traineeId} traineeName={trainee?.display_name} />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('trainer.photos.title')}
      </h1>

      {error && <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>}
      {!error && photos === null && <Spinner />}
      {photos !== null && photos.length === 0 && (
        <p className="font-sans text-sm text-muted">{t('trainer.photos.empty')}</p>
      )}

      {photos !== null && photos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PhotoPane
            photos={sortedPhotos}
            selectedId={leftId}
            onSelect={setLeftId}
            label={t('trainer.photos.before')}
            t={t}
          />
          <PhotoPane
            photos={sortedPhotos}
            selectedId={rightId}
            onSelect={setRightId}
            label={t('trainer.photos.after')}
            t={t}
          />
        </div>
      )}
    </AppShell>
  )
}
