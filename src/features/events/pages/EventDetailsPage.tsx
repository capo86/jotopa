import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { useEvent } from '../hooks'
import { deleteEvent } from '../api'
import { TYPE_LABELS, STATUS_LABELS } from '../schemas'
import { DataState } from '../../../components/ui/DataState'
import { hasPermission, ROLE_LABELS } from '../../../lib/permissions'
import { eventErrorMessage } from '../../../lib/event-errors'
import { DEFAULT_LOCALE } from '../../../lib/config'
import {AttendanceSummary} from '../../info'
import { EventAccessForm } from '../components/EventAccessForm'

export function Component() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deletion = useMutation({ mutationFn: () => deleteEvent(eventId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['events'] }); queryClient.removeQueries({ queryKey: ['event', eventId] }); navigate('/eventos') } })
  if (!query.data) return <DataState loading={query.isFetching} retry={() => { void query.refetch() }} />
  const { event, role } = query.data
  const date = (value: string) => new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'full', timeStyle: 'short', timeZone: event.timezone }).format(new Date(value))
  return <section className="max-w-4xl"><Link to="/eventos" className="text-sm text-forest underline underline-offset-4">Mis eventos</Link><p className="eyebrow mt-8">{TYPE_LABELS[event.type]} · {STATUS_LABELS[event.status]}</p><h1 className="mt-4 break-words font-display text-5xl leading-tight tracking-tight text-forest">{event.title}</h1><p className="mt-4 text-sm text-muted">Tu rol: {role ? ROLE_LABELS[role] : 'Sin acceso'}</p><div className="my-7 flex flex-wrap gap-3">{hasPermission(role,'wall.moderate')?<Link to={`/eventos/${eventId}/buenos-deseos`} className="button-primary">Buenos deseos</Link>:null}{hasPermission(role,'tables.assign')?<Link to={`/eventos/${eventId}/mesas`} className="button-primary">Mesas y cupos</Link>:null}{hasPermission(role,'content.write') ? <Link to={`/eventos/${eventId}/invitacion`} className="button-primary">Diseñar invitación</Link> : null}{hasPermission(role,'invitations.send') && hasPermission(role,'guests.contact_read') ? <Link to={`/eventos/${eventId}/invitaciones`} className="button-primary">Invitaciones</Link> : null}{hasPermission(role, 'guests.read') || hasPermission(role, 'checkin.write') ? <Link to={`/eventos/${eventId}/invitados`} className="button-primary">Invitados</Link> : null}{hasPermission(role, 'event.update') ? <Link to={`/eventos/${eventId}/editar`} className="button-primary">Editar evento</Link> : null}{hasPermission(role, 'members.manage') ? <Link to={`/eventos/${eventId}/equipo`} className="button-primary">Equipo y colaboradores</Link> : null}</div>
    {hasPermission(role,'dashboard.read')?<AttendanceSummary eventId={eventId} />:null}<dl className="divide-y divide-line rounded-2xl border border-line bg-paper px-6 sm:px-8"><div className="setting-row"><dt>Fecha del evento</dt><dd className="max-w-lg">{date(event.starts_at)}</dd></div><div className="setting-row"><dt>Zona horaria</dt><dd>{event.timezone}</dd></div><div className="setting-row"><dt>Fecha límite de confirmación</dt><dd className="max-w-lg">{event.rsvp_deadline ? date(event.rsvp_deadline) : 'Sin definir'}</dd></div><div className="setting-row"><dt>Identificador</dt><dd className="break-all">{event.slug}</dd></div></dl>
    <p className="mt-6 text-sm leading-7 text-muted">Cada persona del equipo tiene su propio acceso. Solo los propietarios y administradores pueden editar los datos generales y gestionar colaboradores.</p>
    {hasPermission(role,'event.update') ? <EventAccessForm key={`${event.id}:${event.timezone}`} event={event} /> : null}
    {hasPermission(role, 'event.delete') ? <details className="mt-10 rounded-xl border border-line p-5 text-sm"><summary className="cursor-pointer font-medium text-clay">Eliminar evento</summary><p className="mt-4 leading-6 text-muted">El evento dejará de estar disponible y se revocarán sus invitaciones al equipo. Se conservará el historial de auditoría.</p><button type="button" className="button-primary mt-4 disabled:opacity-60" disabled={deletion.isPending} onClick={() => deletion.mutate()}>Confirmar eliminación</button>{deletion.isError ? <p role="alert" className="mt-4 text-clay">{eventErrorMessage(deletion.error)}</p> : null}</details> : null}
  </section>
}

