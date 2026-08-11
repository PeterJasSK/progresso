// EN/SK switch. Calls i18n.changeLanguage (LanguageDetector persists to localStorage
// and index.ts mirrors <html lang>). Reachable pre-auth on login/register too (epic Q5).
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, type Language } from '../i18n'

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const active = (i18n.language.split('-')[0] as Language) ?? 'en'

  return (
    <div
      className="inline-flex overflow-hidden rounded-pill border border-border"
      role="group"
      aria-label={t('lang.label')}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const selected = active === lng
        return (
          <button
            key={lng}
            type="button"
            onClick={() => void i18n.changeLanguage(lng)}
            aria-pressed={selected}
            className={
              'px-3 py-1.5 font-sans text-sm ' +
              (selected ? 'bg-accent text-white' : 'bg-surface text-text hover:text-accent')
            }
          >
            {t(`lang.${lng}`)}
          </button>
        )
      })}
    </div>
  )
}
