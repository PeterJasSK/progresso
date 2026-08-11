// /me placeholder (P6 replaces the body). Renders the authenticated shell + a couple of
// StatTiles to prove the token + type + i18n system end-to-end. Clearly marked a stub.
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { StatTile } from '../components/StatTile'
import { Pill } from '../components/Pill'
import { formatNumber } from '../i18n'

export function TraineeHomePlaceholder() {
  const { t } = useTranslation()
  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-heading">{t('home.trainee.title')}</h1>
        <Pill variant="warn">PLACEHOLDER</Pill>
      </div>
      <p className="mb-6 font-sans text-sm text-muted">{t('home.trainee.placeholder')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile
          label={t('home.trainee.weight')}
          value={`${formatNumber(82.4)} kg`}
          delta={`−${formatNumber(1.2)} kg`}
          deltaLabel={t('home.trainee.delta')}
          trend="down"
        />
        <StatTile
          label={t('home.trainee.sessions')}
          value={formatNumber(4)}
          delta={`+${formatNumber(1)}`}
          deltaLabel={t('home.trainee.delta')}
          trend="up"
        />
      </div>
    </AppShell>
  )
}
