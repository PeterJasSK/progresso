// Typed wrappers over the goal API (§5.4). P6 lists + creates; the toggle-complete
// PATCH is P7.
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

export function createGoal(payload: GoalInput): Promise<Goal> {
  return api.post<Goal>('/goals', payload)
}
