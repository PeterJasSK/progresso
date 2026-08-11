// CSRF handling for Django session auth (P1 §13 contract).
// The csrftoken cookie is NOT HttpOnly, so JS can read it and echo it as X-CSRFToken
// on authenticated unsafe requests. GET /auth/me is ensure_csrf_cookie-decorated and
// seeds the cookie; ensureCsrf() guarantees it exists before the first write.

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1'

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

let csrfEnsured = false

// GET /auth/me to seed the csrftoken cookie. The cookie is set by the authenticated
// response (ensure_csrf_cookie runs only once the IsAuthenticated check passes) and by
// login/register's token rotation — anonymous callers get 403 and no cookie, which is
// fine since they never make an authenticated unsafe request. Runs at most once per app
// lifetime unless the cookie is still missing.
export async function ensureCsrf(): Promise<void> {
  if (csrfEnsured && getCookie('csrftoken')) return
  await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
  csrfEnsured = true
}
