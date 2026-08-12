// Typed wrappers over the trainer roster API (P7 §5.5). Screens never inline fetch
// logic. The list endpoint returns DRF's paginated envelope (PAGE_SIZE=50); MVP
// reads the first page only — following `next` is a P8 concern.
import { api } from './api'
import type { Paginated } from './measurements'

export interface RosterEntry {
  id: number
  username: string
  display_name: string
  role: string
  // Newest measurement date (ISO) or null when the trainee has never logged.
  last_measured_at: string | null
  measurement_count: number
  // Always 'weight' in MVP (§11 Q2) — the roster trend arrow tracks weight.
  primary_metric: string
  latest_value: number | null
  delta: number | null
  trend: 'up' | 'down' | 'flat' | null
}

export async function listTrainees(): Promise<RosterEntry[]> {
  const page = await api.get<Paginated<RosterEntry>>('/trainees')
  return page.results
}

export function getTrainee(id: number): Promise<RosterEntry> {
  return api.get<RosterEntry>(`/trainees/${id}`)
}
