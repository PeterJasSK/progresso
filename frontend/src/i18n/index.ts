// react-i18next init. EN base + complete SK catalog. Language is detected from
// localStorage then navigator, persisted to localStorage, and mirrored onto <html lang>.
// Adding a third language is catalog-only: import xx.json and list it below (epic Q6).
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './en.json'
import sk from './sk.json'

export const SUPPORTED_LANGUAGES = ['en', 'sk'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sk: { translation: sk },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  })

// Keep <html lang> in sync so the browser + assistive tech know the active language.
function syncHtmlLang(lng: string): void {
  document.documentElement.setAttribute('lang', lng.split('-')[0])
}
syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

// Locale-aware formatting helpers (numbers still render in the mono font via `font-mono`).
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(i18n.language).format(value)
}

export function formatDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(date)
}

export default i18n
