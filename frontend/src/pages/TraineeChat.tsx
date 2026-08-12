// /trainer/trainees/:id/chat — the trainer's conversation with one trainee
// (P8 §5.8). Resolves the trainee's display name for the header/nav, then renders
// the shared ChatView scoped to that trainee. Access is API-enforced: a trainee
// the trainer doesn't own yields a not-found thread.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../components/AppShell'
import { ChatView } from '../components/ChatView'
import { TrainerNav } from '../components/TrainerNav'
import { Spinner } from '../components/Spinner'
import { getTrainee, type RosterEntry } from '../lib/trainees'

export function TraineeChat() {
  const { t } = useTranslation()
  const { id } = useParams()
  const traineeId = Number(id)
  const [trainee, setTrainee] = useState<RosterEntry | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getTrainee(traineeId)
      .then((data) => active && setTrainee(data))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [traineeId])

  if (error) {
    return (
      <AppShell>
        <TrainerNav traineeId={traineeId} />
        <p className="font-sans text-sm text-danger">{t('errors.unknown')}</p>
      </AppShell>
    )
  }

  if (!trainee) {
    return (
      <AppShell>
        <TrainerNav traineeId={traineeId} />
        <Spinner />
      </AppShell>
    )
  }

  return (
    <ChatView
      withUserId={traineeId}
      title={trainee.display_name}
      nav={<TrainerNav traineeId={traineeId} traineeName={trainee.display_name} />}
    />
  )
}
