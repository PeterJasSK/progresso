// Pill toggle for light↔dark. Accessible label via i18n; reflects state with aria-pressed.
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const { t } = useTranslation()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
      className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 font-sans text-sm text-text hover:border-accent"
    >
      <span aria-hidden="true">{isDark ? '🌙' : '☀️'}</span>
      <span>{isDark ? t('theme.dark') : t('theme.light')}</span>
    </button>
  )
}
