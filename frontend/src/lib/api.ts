// Thin fetch wrapper. Same-origin (VITE_API_BASE default /api/v1), sends the session
// cookie on every request, adds X-CSRFToken on unsafe authenticated requests, and
// surfaces backend error *keys* (never English prose) so callers map them through i18n.
import { ensureCsrf, getCookie } from './csrf'

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1'
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Carries the backend error key + raw payload so callers can look up errors.<key> in i18n.
export class ApiError extends Error {
  readonly status: number
  readonly key: string
  constructor(status: number, key: string) {
    super(key)
    this.name = 'ApiError'
    this.status = status
    this.key = key
  }
}

// Extract a single error key from either envelope the backend uses:
//   login: { "detail": "invalid_credentials" }
//   register: { "username": ["username_taken"], "trainer_id": ["invalid_trainer"] }
function extractErrorKey(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    for (const value of Object.values(obj)) {
      if (typeof value === 'string') return value
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    }
  }
  return 'unknown'
}

interface RequestOptions {
  method?: string
  body?: unknown
  // Multipart uploads: pass a FormData; we must NOT set Content-Type (the browser
  // sets the multipart boundary). JSON body still serializes as before.
  form?: FormData
  anonymous?: boolean
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = {}

  // JSON body sets Content-Type; FormData deliberately does not (§5.7).
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  if (UNSAFE.has(method) && !opts.anonymous) {
    await ensureCsrf()
    const token = getCookie('csrftoken')
    if (token) headers['X-CSRFToken'] = token
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body:
      opts.form !== undefined
        ? opts.form
        : opts.body !== undefined
          ? JSON.stringify(opts.body)
          : undefined,
  })

  if (res.status === 204) return undefined as T

  let payload: unknown = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!res.ok) throw new ApiError(res.status, extractErrorKey(payload))
  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, anonymous = false) =>
    request<T>(path, { method: 'POST', body, anonymous }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  // Multipart upload (measurement capture/edit with photo, §5.7). Defaults to
  // POST (create); pass 'PATCH' for an edit that may replace the photo.
  upload: <T>(path: string, form: FormData, method: 'POST' | 'PATCH' = 'POST') =>
    request<T>(path, { method, form }),
}
