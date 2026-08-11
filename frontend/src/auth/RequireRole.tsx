// Role guard (UI-side only — the API enforces authoritatively in P6/P7). A user whose
// role doesn't match is redirected to their own role home, so a trainee cannot reach
// /trainer/* and vice-versa. Assumes RequireAuth already ran (user present).
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { roleHome, type Role } from './AuthProvider'
import { useAuth } from './useAuth'
import { Spinner } from '../components/Spinner'

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={roleHome(user.role)} replace />
  return <>{children}</>
}
