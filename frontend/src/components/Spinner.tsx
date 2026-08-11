// Full-height loader shown while the /auth/me bootstrap is in flight.
import { useTranslation } from 'react-i18next'

export function Spinner() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-hidden="true"
      />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
