import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth'
import { useEvent } from '../../events'
import { fetchTeam } from '../api'
import { DataState } from '../../../components/ui/DataState'
import { hasPermission } from '../../../lib/permissions'
import { DEFAULT_LOCALE } from '../../../lib/config'
import { MemberRow } from '../components/MemberRow'
import { InviteForm } from '../components/InviteForm'
import { InviteRow } from '../components/InviteRow'

const actions: Record<string, string> = { 'invitation_design.saved':'Borrador visual guardado','invitation_design.published':'Invitación visual publicada','invitation_design.unpublished':'Versión visual retirada','invitation_asset.created':'Fotografía guardada', 'event.created': 'Evento creado', 'event.updated': 'Evento actualizado', 'event.deleted': 'Evento eliminado', 'member.added': 'Colaborador incorporado', 'member.role_changed': 'Rol actualizado', 'member.removed': 'Colaborador retirado', 'invite.created': 'Invitación creada', 'invite.accepted': 'Invitación aceptada', 'invite.revoked': 'Invitación revocada', 'guest.created': 'Invitado agregado', 'guest.updated': 'Invitado actualizado', 'guest.deleted': 'Invitado eliminado', 'guest.link_accessed':'Enlace personal consultado','guest.link_rotated':'Enlace personal regenerado','guest.rsvp_updated':'Respuesta RSVP actualizada','guest.opted_out':'Baja de recordatorios solicitada','template.saved':'Plantilla guardada','template.archived':'Plantilla archivada','invitation.sent':'Envío marcado manualmente','invitation.sent_undone':'Marca manual deshecha','invitation.failed':'Intento no completado','invitation.skipped':'Invitación saltada','invitation.resumed':'Invitación retomada','invitation.copy_requested':'Solicitud de copiar mensaje','invitation.link_copy_requested':'Solicitud de copiar enlace','guests.imported': 'Invitados importados' }

export function Component() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId)
  const { session } = useAuth()
  const canManage = hasPermission(event.data?.role, 'members.manage')
  const team = useQuery({ queryKey: ['team', eventId], queryFn: ({ signal }) => fetchTeam(eventId, signal), enabled: canManage, retry: false })
  if (!event.data?.role || !canManage) return <DataState loading={event.isFetching} />
  const role = event.data.role
  const owners = team.data?.team.filter(member => member.role === 'owner').length ?? 0
  const teamNames = new Map(team.data?.team.map(member => [member.user_id, member.full_name || 'Colaborador']))
  return <section className="max-w-4xl"><Link to={`/eventos/${eventId}`} className="text-sm text-forest underline underline-offset-4">Volver al evento</Link><p className="eyebrow mt-8">{event.data.event.title}</p><h1 className="mt-4 font-display text-4xl leading-tight tracking-tight text-forest sm:text-5xl">Equipo y colaboradores</h1><p className="mt-4 mb-8 text-sm leading-7 text-muted">Un rol para cada persona. El evento siempre debe conservar al menos un propietario.</p>
    <InviteForm eventId={eventId} actorRole={role} />
    {!team.data ? <DataState loading={team.isFetching} retry={() => { void team.refetch() }} /> : <>
      <section className="mt-8 rounded-2xl border border-line bg-paper p-5 sm:p-7" aria-labelledby="members-title"><h2 id="members-title" className="text-xl font-medium">Personas del equipo</h2><ul>{team.data.team.map(member => <MemberRow key={member.id} member={member} actorRole={role} ownId={session?.user.id ?? ''} eventId={eventId} ownerCount={owners} />)}</ul></section>
      <section className="mt-8 rounded-2xl border border-line bg-paper p-5 sm:p-7" aria-labelledby="invites-title"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="invites-title" className="text-xl font-medium">Invitaciones al equipo</h2><button type="button" className="text-xs text-forest underline" onClick={() => { void team.refetch() }}>Actualizar equipo</button></div>{team.data.invites.length ? <ul>{team.data.invites.map(invite => <InviteRow key={invite.id} invite={invite} eventId={eventId} actorRole={role} checkedAt={team.data.checkedAt} />)}</ul> : <p className="mt-4 text-sm text-muted">Todavía no hay invitaciones.</p>}</section>
      <section className="mt-8 border-t border-line pt-7" aria-labelledby="audit-title"><h2 id="audit-title" className="text-xl font-medium">Actividad del evento</h2><p className="mt-2 text-xs text-muted">Las últimas 30 acciones. El historial completo se conserva en la base.</p><ol className="mt-5 divide-y divide-line">{team.data.audit.map(entry => <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div><span>{actions[entry.action] ?? 'Acción del equipo'}</span><p className="mt-1 text-xs text-muted">{entry.actor_id ? teamNames.get(entry.actor_id) ?? 'Colaborador anterior del equipo' : 'Sistema'}</p></div><time className="text-xs text-muted" dateTime={entry.created_at}>{new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: event.data.event.timezone }).format(new Date(entry.created_at))}</time></li>)}</ol></section>
    </>}
  </section>
}
