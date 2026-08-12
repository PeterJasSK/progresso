// /trainer — the roster (P7 §5.6). One RosterCard per owned trainee in a
// responsive grid (stacked on mobile). Empty state explains that trainees appear
// once they self-register under, or link to, this trainer. Action-bar CTA opens
// the onboarding instructions.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TrainerNav } from '../components/TrainerNav'
import { RosterCard } from '../components/RosterCard'
import { DataSection } from '../components/DataSection'
import { Button } from '../components/Button'
import { Spinner } from '../components/Spinner'
import { listTrainees, type RosterEntry } from '../lib/trainees'

export function TrainerHome() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [roster, setRoster] = useState<RosterEntry[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    listTrainees()
      .then((data) => active && setRoster(data))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [])

  const cta = (
    <Button className="w-full" onClick={() => navigate('/trainer/trainees/new')}>
      {t('trainer.roster.addCta')}
    </Button>
  )

  return (
    <AppShell actionBar={cta}>
      <TrainerNav />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('trainer.roster.title')}
      </h1>

      {error && <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>}
      {!error && roster === null && <Spinner />}
      {roster !== null && roster.length === 0 && (
        <p className="font-sans text-sm text-muted">{t('trainer.roster.empty')}</p>
      )}

      {roster !== null && roster.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {roster.map((entry) => (
            <RosterCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <DataSection />
    </AppShell>
  )
}
