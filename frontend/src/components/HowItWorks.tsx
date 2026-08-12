// Presentational "How it works" explainer for the login screen (P10). Three steps
// mirror the core loop (CLAUDE.md): log → review → adjust. No props, no state, no
// API. All copy via i18n; colors via design tokens (no hex, no icon library).
import { useTranslation } from 'react-i18next'
import { Card } from './Card'

const STEPS = [1, 2, 3] as const

export function HowItWorks() {
  const { t } = useTranslation()
  return (
    <Card className="mt-6">
      <h2 className="mb-4 font-display text-lg font-bold text-heading">
        {t('landing.title')}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((n) => (
          <div key={n} className="flex flex-col gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent font-mono text-sm font-bold text-white">
              {n}
            </span>
            <h3 className="font-display text-base text-heading">
              {t(`landing.step${n}.title`)}
            </h3>
            <p className="font-sans text-sm text-muted">
              {t(`landing.step${n}.body`)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
