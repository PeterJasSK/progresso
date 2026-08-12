// /trainer/trainees/:id/progress — the trainee's charts (P7 §5.6). Thin wrapper
// over the shared ProgressView: their series + the trainer nav.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ProgressView } from '../components/ProgressView'
import { TrainerNav } from '../components/TrainerNav'
import { getTrainee } from '../lib/trainees'

export function TraineeProgress() {
  const { id } = useParams()
  const traineeId = Number(id)
  const [name, setName] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    getTrainee(traineeId)
      .then((tr) => active && setName(tr.display_name))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [traineeId])

  return (
    <ProgressView
      userId={traineeId}
      nav={<TrainerNav traineeId={traineeId} traineeName={name} />}
    />
  )
}
