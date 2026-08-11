// `/` router: send trainee → /me, trainer → /trainer, anonymous → /login.
// Waits for the /auth/me bootstrap so it redirects with the resolved user.
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { roleHome } from '../auth/AuthProvider'
import { Spinner } from '../components/Spinner'

export function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roleHome(user.role)} replace />
}
