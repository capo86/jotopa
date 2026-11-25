import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './context'

export function RecoveryRedirect() {
  const { recovery, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <p role="status">Comprobando tu sesión…</p>
  if (recovery && location.pathname !== '/restablecer-contrasena') return <Navigate to="/restablecer-contrasena" replace />
  return <Outlet />
}
