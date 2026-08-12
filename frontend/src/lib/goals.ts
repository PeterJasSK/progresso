// Typed wrappers over the goal API (§5.4). P6 lists + creates; P7 adds the
// toggle-complete PATCH.
import { api } from './api'
import type { Paginated } from './measurements'
import type { MetricKey } from './metricMeta'

export type GoalDirection = 'increase' | 'decrease'

export interface Goal {
  id: number
  user: number
  metric: MetricKey
  target_value: string
  direction: GoalDirection
  target_date: string | null
  is_completed: boolean
  description: string
  created_at: string
}

export interface GoalInput {
  metric: MetricKey
  target_value: number
  direction: GoalDirection
  target_date?: string | null
  description?: string
}

export async function listGoals(userId?: number): Promise<Goal[]> {
  const q = userId === undefined ? '' : `?user=${userId}`
  const page = await api.get<Paginated<Goal>>(`/goals${q}`)
  return page.results
}

// Create a goal (P6 self; P9 trainer-for-trainee). Omit `userId` for the caller's
// own goal; pass a trainee id (as a trainer) to author one for them — the backend
// gates it through `can_access`.
export function createGoal(payload: GoalInput, userId?: number): Promise<Goal> {
  const q = userId === undefined ? '' : `?user=${userId}`
  return api.post<Goal>(`/goals${q}`, payload)
}

// Toggle-complete (P7): owner trainee or the trainer who owns the trainee. Only
// `is_completed` is writable on this route (GoalToggleSerializer).
export function toggleGoal(id: number, isCompleted: boolean): Promise<Goal> {
  return api.patch<Goal>(`/goals/${id}`, { is_completed: isCompleted })
}
