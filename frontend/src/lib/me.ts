// Self-service trainer linking for a trainee (P7 §5.3b). PATCH /auth/me sets or
// clears the caller's own head_trainer; null unlinks (back to self-tracking).
import { api } from './api'
import type { User } from '../auth/AuthProvider'

export function linkTrainer(trainerId: number | null): Promise<User> {
  return api.patch<User>('/auth/me', { trainer_id: trainerId })
}
