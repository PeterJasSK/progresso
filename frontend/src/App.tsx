// Route table + guards (plan §5.9). /logout is an action route that clears the session
// then returns to /login. Role homes are guarded by RequireAuth + RequireRole.
import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { Spinner } from './components/Spinner'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { RootRedirect } from './pages/RootRedirect'
import { NotFoundPage } from './pages/NotFoundPage'
import { TraineeHomePlaceholder } from './pages/TraineeHomePlaceholder'
import { TrainerHomePlaceholder } from './pages/TrainerHomePlaceholder'

function LogoutRoute() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    logout().finally(() => navigate('/login', { replace: true }))
  }, [logout, navigate])
  return <Spinner />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/logout" element={<LogoutRoute />} />
      <Route path="/" element={<RootRedirect />} />
      <Route
        path="/me"
        element={
          <RequireAuth>
            <RequireRole role="trainee">
              <TraineeHomePlaceholder />
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/trainer"
        element={
          <RequireAuth>
            <RequireRole role="trainer">
              <TrainerHomePlaceholder />
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/index.html" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
