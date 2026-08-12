// Auth state for the SPA. Bootstraps the session once from GET /api/v1/auth/me on start
// (Spinner shows until it resolves; 403 = anonymous). Exposes login/register/logout that
// call the P1 endpoints; register auto-logs-in (backend sets the session on 201).
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'

export type Role = 'trainee' | 'trainer'

export interface User {
  id: number
  username: string
  role: Role
  // A trainee's linked trainer (P7 §5.3b). Null for trainers and for unassigned
  // (self-tracking) trainees.
  head_trainer?: number | null
  head_trainer_name?: string | null
}

export interface RegisterInput {
  username: string
  password: string
  role: Role
  trainer_id?: number | null
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  // Re-fetch the current user (e.g. after a trainee links/unlinks a trainer, P7).
  refreshUser: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)

// Role → landing route. Central so guards and redirects agree.
// eslint-disable-next-line react-refresh/only-export-components
export function roleHome(role: Role): string {
  return role === 'trainer' ? '/trainer' : '/me'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api
      .get<User>('/auth/me')
      .then((u) => {
        if (active) setUser(u)
      })
      .catch(() => {
        if (active) setUser(null) // 403 → anonymous
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const u = await api.post<User>('/auth/login', { username, password }, true)
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const u = await api.post<User>('/auth/register', input, true)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await api.post<void>('/auth/logout')
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const u = await api.get<User>('/auth/me')
    setUser(u)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}
