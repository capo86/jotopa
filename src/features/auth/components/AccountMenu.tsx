import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../context'
import { signOut } from '../api'
import { authErrorMessage } from '../errors'

export function AccountMenu() {
  const { ready, session } = useAuth()
  const navigate = useNavigate()
  const logout = useMutation({ mutationFn: signOut, onSuccess: () => navigate('/iniciar-sesion', { replace: true }) })
  if (!ready) return <span role="status" className="text-xs text-muted">Cargando sesión…</span>
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-forest">
      {session ? <><Link to="/perfil" className="font-medium underline underline-offset-4">Mi perfil</Link><button type="button" className="cursor-pointer rounded-lg border border-line px-3 py-2 disabled:opacity-60" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Cerrando…' : 'Cerrar sesión'}</button></> : <><Link to="/iniciar-sesion" className="underline underline-offset-4">Iniciar sesión</Link><Link to="/registro" className="rounded-lg border border-line px-3 py-2 font-medium">Crear cuenta</Link></>}
      {logout.isError ? <p role="alert" className="w-full text-clay">{authErrorMessage(logout.error)}</p> : null}
    </div>
  )
}
