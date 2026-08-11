import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bgdeep px-4 text-center">
      <h1 className="font-display text-5xl font-bold text-heading">404</h1>
      <h2 className="font-display text-xl text-heading">{t('notfound.title')}</h2>
      <p className="font-sans text-sm text-muted">{t('notfound.message')}</p>
      <Link to="/" className="mt-2 text-accent hover:underline">
        {t('notfound.home')}
      </Link>
    </div>
  )
}
