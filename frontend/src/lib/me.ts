// Self-service account operations (P7 linking + P8 data lifecycle). PATCH /auth/me
// sets or clears the caller's own head_trainer; null unlinks (self-tracking). The
// P8 privacy path: export the caller's own data, or delete the account entirely.
import { api } from './api'
import type { User } from '../auth/AuthProvider'

export function linkTrainer(trainerId: number | null): Promise<User> {
  return api.patch<User>('/auth/me', { trainer_id: trainerId })
}

// The caller's full data export (profile + measurements + goals + messages),
// photos as URLs. Self-only (P8 §5.6, AC-9).
export function exportData(): Promise<unknown> {
  return api.get<unknown>('/me/export')
}

// Permanently delete the caller's account and all their data (P8 §5.6, AC-9).
// Destructive + irreversible — the caller must confirm before this is called.
export function deleteAccount(): Promise<void> {
  return api.del<void>('/me')
}
