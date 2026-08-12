// /me/progress — the trainee's own charts. Thin wrapper over the shared
// ProgressView (P7 §5.6): self series + the trainee nav.
import { TraineeNav } from '../components/TraineeNav'
import { ProgressView } from '../components/ProgressView'

export function Progress() {
  return <ProgressView nav={<TraineeNav />} />
}
