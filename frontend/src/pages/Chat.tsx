// /me/chat — the trainee's conversation with their trainer (P8 §5.8). The
// counterpart is the trainee's linked trainer; an unassigned (self-tracking)
// trainee is prompted to link one first (chat needs both parties in a
// relationship). The thread UI itself is the shared ChatView.
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { TraineeNav } from '../components/TraineeNav'
import { ChatView } from '../components/ChatView'
import { useAuth } from '../auth/useAuth'

export function Chat() {
  const { t } = useTranslation()
  const { user } = useAuth()

  if (!user) return null

  if (!user.head_trainer) {
    return (
      <AppShell>
        <TraineeNav />
        <h1 className="mb-4 font-display text-2xl font-bold text-heading">
          {t('chat.title')}
        </h1>
        <p className="font-sans text-sm text-muted">
          {t('chat.noTrainer')}{' '}
          <Link to="/me" className="text-accent">
            {t('chat.linkTrainer')}
          </Link>
        </p>
      </AppShell>
    )
  }

  return (
    <ChatView
      withUserId={user.head_trainer}
      title={user.head_trainer_name ?? t('chat.title')}
      nav={<TraineeNav />}
    />
  )
}
