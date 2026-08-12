// Typed wrappers over the measurement API (§5.4). Screens never inline fetch logic.
// DecimalFields serialize as strings (DRF COERCE_DECIMAL_TO_STRING); BMI and the
// series values are JSON numbers.
import { api } from './api'
import type { MetricKey } from './metricMeta'

export interface Measurement {
  id: number
  user: number
  unit_system: string
  weight: string | null
  height: string | null
  chest: string | null
  waist: string | null
  hips: string | null
  biceps: string | null
  thigh: string | null
  calf: string | null
  body_fat_pct: string | null
  measured_at: string
  created_at: string
  bmi: number | null
  photo_url: string
  thumbnail_url: string
}

export interface MetricSummary {
  latest: number | null
  delta: number | null
  trend: 'up' | 'down' | 'flat' | null
}

export interface Series {
  user: number | null
  unit_system: string | null
  dates: string[]
  metrics: Partial<Record<MetricKey, (number | null)[]>>
  summary: Partial<Record<MetricKey, MetricSummary>>
}

// List endpoints return DRF's paginated envelope (settings PAGE_SIZE=50); the
// series/detail/create responses do not.
export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1'

// P8 (§5.5, AC-7): follow the `next` cursor to return every row, not just the
// first 50 — a trainee can exceed a page of measurements/photos, a trainer a page
// of trainees. `next` is an absolute URL; strip the API base so the api client
// (which re-prepends it) can fetch each page. Silent truncation is the bug this
// fixes, so nothing is dropped.
export async function fetchAllPages<T>(firstPath: string): Promise<T[]> {
  const out: T[] = []
  let path: string | null = firstPath
  while (path) {
    const page: Paginated<T> = await api.get<Paginated<T>>(path)
    out.push(...page.results)
    path = page.next ? toRelativePath(page.next) : null
  }
  return out
}

function toRelativePath(next: string): string {
  try {
    const url = new URL(next)
    return url.pathname.replace(API_BASE, '') + url.search
  } catch {
    return next.replace(API_BASE, '')
  }
}

function userQuery(userId?: number): string {
  return userId === undefined ? '' : `?user=${userId}`
}

export function listMeasurements(userId?: number): Promise<Measurement[]> {
  return fetchAllPages<Measurement>(`/measurements${userQuery(userId)}`)
}

export function getMeasurement(id: number): Promise<Measurement> {
  return api.get<Measurement>(`/measurements/${id}`)
}

export function createMeasurement(form: FormData): Promise<Measurement> {
  return api.upload<Measurement>('/measurements', form)
}

export function updateMeasurement(id: number, form: FormData): Promise<Measurement> {
  return api.upload<Measurement>(`/measurements/${id}`, form, 'PATCH')
}

export function deleteMeasurement(id: number): Promise<void> {
  return api.del<void>(`/measurements/${id}`)
}

export function getSeries(userId?: number): Promise<Series> {
  return api.get<Series>(`/measurements/series${userQuery(userId)}`)
}

// Measurements that have a photo, for the P7 compare picker (§5.5). Paginated
// envelope; P8 follows `next` so every dated photo is available (AC-7).
export function listPhotos(userId?: number): Promise<Measurement[]> {
  return fetchAllPages<Measurement>(`/measurements/photos${userQuery(userId)}`)
}
