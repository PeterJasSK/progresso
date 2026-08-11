// Trainee sub-nav: links between the trainee screens. Active link uses the accent.
// Labels via i18n. (P7 builds its own trainer nav; this stays trainee-only.)
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const links = [
  { to: '/me', key: 'nav.home', end: true },
  { to: '/me/measurements', key: 'nav.measurements', end: false },
  { to: '/me/progress', key: 'nav.progress', end: false },
  { to: '/me/goals', key: 'nav.goals', end: false },
]

export function TraineeNav() {
  const { t } = useTranslation()
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            'rounded-sm px-3 py-1.5 font-sans text-sm font-medium transition-colors ' +
            (isActive ? 'bg-surface text-accent' : 'text-muted hover:text-text')
          }
        >
          {t(link.key)}
        </NavLink>
      ))}
    </nav>
  )
}
