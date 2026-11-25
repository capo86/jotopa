import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './context'

export function RequireAuth() {
  const { session, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <p role="status">Comprobando tu sesión…</p>
  if (!session) return <Navigate to="/iniciar-sesion" replace state={{ from: location.pathname }} />
  return <Outlet />
}
