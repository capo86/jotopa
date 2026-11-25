import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth'
import { previewInvite, acceptInvite } from '../api'
import { ROLE_LABELS } from '../../../lib/permissions'
import { eventErrorMessage } from '../../../lib/event-errors'

const storageKey = 'jotopa:team-invite:v1'
function initialToken() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  let value = params.get('token')
  if (value === null) { try { value = sessionStorage.getItem(storageKey) } catch { value = null } }
  return value && /^[a-f0-9]{64}$/.test(value) ? value : ''
}

export function Component() {
  const [token] = useState(initialToken)
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  useEffect(() => {
    if (token) { try { sessionStorage.setItem(storageKey, token) } catch { /* The current page can still accept the token. */ } }
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }, [token])
  const invitation = useQuery({ queryKey: ['team-invite', token], queryFn: ({ signal }) => previewInvite(token, signal), enabled: Boolean(token && session), retry: false })
  const accept = useMutation({ mutationFn: () => acceptInvite(token), onSuccess: async id => {
    try { sessionStorage.removeItem(storageKey) } catch { /* No persistent storage was required. */ }
    queryClient.removeQueries({ queryKey: ['team-invite'] })
    await queryClient.invalidateQueries({ queryKey: ['events'] })
    navigate(`/eventos/${id}`, { replace: true })
  } })
  return <section className="mx-auto max-w-lg py-7"><p className="eyebrow">HAY UN LUGAR PARA VOS</p><h1 className="mt-4 font-display text-4xl leading-tight tracking-tight text-forest">Te invitaron a colaborar.</h1><div className="mt-7 rounded-2xl border border-line bg-paper p-6">
    {!token ? <p role="alert" className="text-sm leading-7 text-muted">El enlace no es válido. Pedile al anfitrión una nueva invitación.</p> : !session ? <><p className="text-sm leading-7 text-muted">Iniciá sesión o creá una cuenta con el mismo correo al que llegó la invitación. Después podrás revisar y aceptar el rol asignado.</p><div className="mt-5 flex flex-wrap gap-3"><Link to="/iniciar-sesion" state={{ from: '/equipo/aceptar' }} className="button-primary">Iniciar sesión</Link><Link to="/registro" state={{ from: '/equipo/aceptar' }} className="button-primary">Crear cuenta</Link></div></> : invitation.isPending ? <p role="status" className="text-sm">Comprobando tu invitación…</p> : invitation.isError ? <><p role="alert" className="text-sm leading-7 text-clay">{eventErrorMessage(invitation.error)}</p><p className="mt-4 text-sm leading-7 text-muted">Si estás usando otra cuenta, cerrá sesión e ingresá con el correo que recibió la invitación.</p></> : <><h2 className="break-words font-display text-3xl text-forest">{invitation.data.event_title}</h2><p className="mt-4 text-sm text-muted">Te asignaron el rol de <strong>{ROLE_LABELS[invitation.data.role]}</strong>.</p><p className="mt-3 text-xs leading-6 text-muted">El enlace se usa una sola vez. Aceptarlo te permite colaborar con los permisos de ese rol.</p><button type="button" className="button-primary mt-6 disabled:opacity-60" disabled={accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? 'Aceptando…' : 'Aceptar invitación'}</button>{accept.isError ? <p role="alert" className="mt-4 text-sm text-clay">{eventErrorMessage(accept.error)}</p> : null}</>}
  </div></section>
}
