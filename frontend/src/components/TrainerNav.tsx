// Trainer sub-nav (P7 §5.4). At the roster level it shows a single "Roster" link;
// inside a trainee it becomes a breadcrumb-style row: back to the roster plus the
// links between that trainee's screens. Labels via i18n; active link uses accent.
// (Mirrors TraineeNav — chat is P8, absent.)
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface TrainerNavProps {
  // When set, render the within-a-trainee links for this trainee.
  traineeId?: number
  traineeName?: string
}

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  'rounded-sm px-3 py-1.5 font-sans text-sm font-medium transition-colors ' +
  (isActive ? 'bg-surface text-accent' : 'text-muted hover:text-text')

export function TrainerNav({ traineeId, traineeName }: TrainerNavProps) {
  const { t } = useTranslation()

  if (traineeId === undefined) {
    return (
      <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
        <NavLink to="/trainer" end className={linkClass}>
          {t('nav.trainer.roster')}
        </NavLink>
      </nav>
    )
  }

  const base = `/trainer/trainees/${traineeId}`
  const links = [
    { to: base, key: 'nav.trainer.overview', end: true },
    { to: `${base}/measurements`, key: 'nav.trainer.measurements', end: false },
    { to: `${base}/progress`, key: 'nav.trainer.progress', end: false },
    { to: `${base}/photos`, key: 'nav.trainer.photos', end: false },
    { to: `${base}/goals`, key: 'nav.trainer.goals', end: false },
  ]

  return (
    <nav className="mb-6 border-b border-border pb-3">
      <NavLink
        to="/trainer"
        className="mb-2 inline-block font-sans text-sm text-muted hover:text-text"
      >
        ← {t('nav.trainer.roster')}
      </NavLink>
      {traineeName && (
        <div className="mb-2 font-display text-sm font-bold text-heading">
          {traineeName}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
            {t(link.key)}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
