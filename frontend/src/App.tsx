// Route table + guards (plan §5.9). /logout is an action route that clears the session
// then returns to /login. Role homes are guarded by RequireAuth + RequireRole.
import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { Spinner } from './components/Spinner'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { RootRedirect } from './pages/RootRedirect'
import { NotFoundPage } from './pages/NotFoundPage'
import { TraineeHome } from './pages/TraineeHome'
import { MeasurementsList } from './pages/MeasurementsList'
import { MeasurementForm } from './pages/MeasurementForm'
import { MeasurementDetail } from './pages/MeasurementDetail'
import { Progress } from './pages/Progress'
import { Goals } from './pages/Goals'
import { Chat } from './pages/Chat'
import { TraineeChat } from './pages/TraineeChat'
import { TrainerHome } from './pages/TrainerHome'
import { AddTrainee } from './pages/AddTrainee'
import { TraineeOverview } from './pages/TraineeOverview'
import { TraineeMeasurements } from './pages/TraineeMeasurements'
import { TraineeMeasurementDetail } from './pages/TraineeMeasurementDetail'
import { TraineeProgress } from './pages/TraineeProgress'
import { PhotoCompare } from './pages/PhotoCompare'
import { TraineeGoals } from './pages/TraineeGoals'
import { ProfilePage } from './pages/ProfilePage'

function LogoutRoute() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    logout().finally(() => navigate('/login', { replace: true }))
  }, [logout, navigate])
  return <Spinner />
}

// Wrap a trainee screen in the auth + role guards (trainee-only, §5.3).
function trainee(el: ReactNode) {
  return (
    <RequireAuth>
      <RequireRole role="trainee">{el}</RequireRole>
    </RequireAuth>
  )
}

// Wrap an authenticated screen with no role restriction — both roles reach it
// (P9 /profile: content is role-conditional inside the page).
function authed(el: ReactNode) {
  return <RequireAuth>{el}</RequireAuth>
}

// Wrap a trainer screen in the auth + role guards (trainer-only, P7 §5.4).
function trainer(el: ReactNode) {
  return (
    <RequireAuth>
      <RequireRole role="trainer">{el}</RequireRole>
    </RequireAuth>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/logout" element={<LogoutRoute />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="/profile" element={authed(<ProfilePage />)} />
      <Route path="/me" element={trainee(<TraineeHome />)} />
      <Route path="/me/measurements" element={trainee(<MeasurementsList />)} />
      <Route path="/me/measurements/new" element={trainee(<MeasurementForm />)} />
      <Route path="/me/measurements/:id" element={trainee(<MeasurementDetail />)} />
      <Route path="/me/measurements/:id/edit" element={trainee(<MeasurementForm />)} />
      <Route path="/me/progress" element={trainee(<Progress />)} />
      <Route path="/me/goals" element={trainee(<Goals />)} />
      <Route path="/me/chat" element={trainee(<Chat />)} />
      <Route path="/trainer" element={trainer(<TrainerHome />)} />
      <Route path="/trainer/trainees/new" element={trainer(<AddTrainee />)} />
      <Route path="/trainer/trainees/:id" element={trainer(<TraineeOverview />)} />
      <Route
        path="/trainer/trainees/:id/measurements"
        element={trainer(<TraineeMeasurements />)}
      />
      <Route
        path="/trainer/trainees/:id/measurements/:mid"
        element={trainer(<TraineeMeasurementDetail />)}
      />
      <Route
        path="/trainer/trainees/:id/progress"
        element={trainer(<TraineeProgress />)}
      />
      <Route
        path="/trainer/trainees/:id/photos"
        element={trainer(<PhotoCompare />)}
      />
      <Route
        path="/trainer/trainees/:id/goals"
        element={trainer(<TraineeGoals />)}
      />
      <Route
        path="/trainer/trainees/:id/chat"
        element={trainer(<TraineeChat />)}
      />
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/index.html" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
