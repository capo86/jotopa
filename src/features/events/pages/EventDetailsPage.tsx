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
import ArrowRight from 'lucide-react/icons/arrow-right'
import Send from 'lucide-react/icons/send'
import Users from 'lucide-react/icons/users'
import Palette from 'lucide-react/icons/palette'
import Armchair from 'lucide-react/icons/armchair'
import Heart from 'lucide-react/icons/heart'
import Settings from 'lucide-react/icons/settings'
import UserRoundCog from 'lucide-react/icons/user-round-cog'

export function Component() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deletion = useMutation({ mutationFn: () => deleteEvent(eventId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['events'] }); queryClient.removeQueries({ queryKey: ['event', eventId] }); navigate('/eventos') } })
  if (!query.data) return <DataState loading={query.isFetching} retry={() => { void query.refetch() }} />
  const { event, role } = query.data
  const date = (value: string) => new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'full', timeStyle: 'short', timeZone: event.timezone }).format(new Date(value))
  const tools = [
    { label: 'Invitados', description: 'Lista, datos y confirmaciones', path: 'invitados', icon: Users, visible: hasPermission(role, 'guests.read') || hasPermission(role, 'checkin.write') },
    { label: 'Diseñar invitación', description: 'Personalizá la página del evento', path: 'invitacion', icon: Palette, visible: hasPermission(role, 'content.write') },
    { label: 'Mesas y cupos', description: 'Organizá los lugares y asistentes', path: 'mesas', icon: Armchair, visible: hasPermission(role, 'tables.assign') },
    { label: 'Buenos deseos', description: 'Revisá mensajes y proyección', path: 'buenos-deseos', icon: Heart, visible: hasPermission(role, 'wall.moderate') },
    { label: 'Editar evento', description: 'Fechas, datos y configuración', path: 'editar', icon: Settings, visible: hasPermission(role, 'event.update') },
    { label: 'Equipo y colaboradores', description: 'Administrá accesos y roles', path: 'equipo', icon: UserRoundCog, visible: hasPermission(role, 'members.manage') },
  ].filter(tool => tool.visible)
  const canSend = hasPermission(role, 'invitations.send') && hasPermission(role, 'guests.contact_read')
  return <section className="max-w-4xl"><Link to="/eventos" className="text-sm text-forest underline underline-offset-4">Mis eventos</Link><p className="eyebrow mt-8">{TYPE_LABELS[event.type]} · {STATUS_LABELS[event.status]}</p><h1 className="mt-4 break-words font-display text-5xl leading-tight tracking-tight text-forest">{event.title}</h1><p className="mt-4 text-sm text-muted">Tu rol: {role ? ROLE_LABELS[role] : 'Sin acceso'}</p>
    <div className="my-8 space-y-5">
      {canSend ? <Link to={`/eventos/${eventId}/invitaciones`} className="group flex items-center gap-4 rounded-2xl bg-forest p-5 text-paper transition-colors hover:bg-[#315f50] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest sm:p-6"><span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10"><Send aria-hidden="true" size={22} /></span><span className="min-w-0 flex-1"><span className="block font-medium">Enviar invitaciones</span><span className="mt-1 block text-sm leading-6 text-paper/80">Prepará mensajes personales para tus invitados y compartilos por WhatsApp.</span></span><ArrowRight aria-hidden="true" size={20} className="shrink-0 transition-transform group-hover:translate-x-1" /></Link> : null}
      {tools.length ? <div><div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="font-display text-2xl text-forest">Herramientas del evento</h2><span className="text-xs text-muted">Todo en un lugar</span></div><nav aria-label="Herramientas del evento" className="grid gap-3 sm:grid-cols-2">{tools.map(({label, description, path, icon: Icon}) => <Link key={path} to={`/eventos/${eventId}/${path}`} className="group flex min-w-0 items-center gap-4 rounded-xl border border-line bg-paper p-4 transition-colors hover:border-forest/40 hover:bg-[#f1f3e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"><span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#e8eddf] text-forest"><Icon aria-hidden="true" size={20} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-forest">{label}</span><span className="mt-1 block text-xs leading-5 text-muted">{description}</span></span><ArrowRight aria-hidden="true" size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-1" /></Link>)}</nav></div> : null}
    </div>
    {hasPermission(role,'dashboard.read')?<AttendanceSummary eventId={eventId} />:null}<dl className="divide-y divide-line rounded-2xl border border-line bg-paper px-6 sm:px-8"><div className="setting-row"><dt>Fecha del evento</dt><dd className="max-w-lg">{date(event.starts_at)}</dd></div><div className="setting-row"><dt>Zona horaria</dt><dd>{event.timezone}</dd></div><div className="setting-row"><dt>Fecha límite de confirmación</dt><dd className="max-w-lg">{event.rsvp_deadline ? date(event.rsvp_deadline) : 'Sin definir'}</dd></div><div className="setting-row"><dt>Identificador</dt><dd className="break-all">{event.slug}</dd></div></dl>
    <p className="mt-6 text-sm leading-7 text-muted">Cada persona del equipo tiene su propio acceso. Solo los propietarios y administradores pueden editar los datos generales y gestionar colaboradores.</p>
    {hasPermission(role,'event.update') ? <EventAccessForm key={`${event.id}:${event.timezone}`} event={event} /> : null}
    {hasPermission(role, 'event.delete') ? <details className="mt-10 rounded-xl border border-line p-5 text-sm"><summary className="cursor-pointer font-medium text-clay">Eliminar evento</summary><p className="mt-4 leading-6 text-muted">El evento dejará de estar disponible y se revocarán sus invitaciones al equipo. Se conservará el historial de auditoría.</p><button type="button" className="button-primary mt-4 disabled:opacity-60" disabled={deletion.isPending} onClick={() => deletion.mutate()}>Confirmar eliminación</button>{deletion.isError ? <p role="alert" className="mt-4 text-clay">{eventErrorMessage(deletion.error)}</p> : null}</details> : null}
  </section>
}

