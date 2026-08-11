// /trainer placeholder (P7 replaces the body). Same proof-of-system role as the trainee
// stub. Clearly marked a placeholder so it isn't mistaken for a finished screen.
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { StatTile } from '../components/StatTile'
import { Pill } from '../components/Pill'
import { formatNumber } from '../i18n'

export function TrainerHomePlaceholder() {
  const { t } = useTranslation()
  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-heading">{t('home.trainer.title')}</h1>
        <Pill variant="warn">PLACEHOLDER</Pill>
      </div>
      <p className="mb-6 font-sans text-sm text-muted">{t('home.trainer.placeholder')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile
          label={t('home.trainer.clients')}
          value={formatNumber(12)}
          delta={`+${formatNumber(2)}`}
          deltaLabel={t('home.trainer.delta')}
          trend="up"
        />
        <StatTile
          label={t('home.trainer.checkins')}
          value={formatNumber(7)}
          delta={formatNumber(0)}
          deltaLabel={t('home.trainer.delta')}
          trend="flat"
        />
      </div>
    </AppShell>
  )
}
