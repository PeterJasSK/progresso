// /trainer/trainees/new — onboarding instructions (P7 §5.3c, Q1). Onboarding is
// self-registration: a client registers and picks this trainer (or links later
// from their own home). No account-creation form, no POST /trainees. Shows the
// signup link and the trainer's display name so the client can find them.
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TrainerNav } from '../components/TrainerNav'
import { Card } from '../components/Card'
import { useAuth } from '../auth/useAuth'

export function AddTrainee() {
  const { t } = useTranslation()
  const { user } = useAuth()
  // Same-origin signup URL — the app is served from the site root.
  const signupUrl = `${window.location.origin}/register`

  return (
    <AppShell>
      <TrainerNav />
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">
        {t('trainer.addTrainee.title')}
      </h1>
      <Card className="flex flex-col gap-4">
        <p className="font-sans text-sm text-text">{t('trainer.addTrainee.intro')}</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 font-sans text-sm text-text">
          <li>{t('trainer.addTrainee.step1')}</li>
          <li>{t('trainer.addTrainee.step2')}</li>
          <li>{t('trainer.addTrainee.step3')}</li>
        </ol>
        <div>
          <div className="font-sans text-xs text-muted">
            {t('trainer.addTrainee.signupLink')}
          </div>
          <a
            href={signupUrl}
            className="break-all font-mono text-sm text-accent hover:underline"
          >
            {signupUrl}
          </a>
        </div>
        {user && (
          <div>
            <div className="font-sans text-xs text-muted">
              {t('trainer.addTrainee.yourName')}
            </div>
            <div className="font-mono text-sm text-text">{user.username}</div>
          </div>
        )}
      </Card>
    </AppShell>
  )
}
