import { Link, useParams } from 'react-router'
import { useEvent } from '../hooks'
import { hasPermission } from '../../../lib/permissions'
import { DataState } from '../../../components/ui/DataState'
import { EventForm } from '../components/EventForm'
import { EventAccessForm } from '../components/EventAccessForm'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import Settings2 from 'lucide-react/icons/settings-2'
import { STATUS_LABELS, TYPE_LABELS } from '../schemas'

export function Component() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  if (!query.data || !hasPermission(query.data.role, 'event.update')) return <DataState loading={query.isFetching} />
  const {event}=query.data
  return <section className="max-w-5xl">
    <Link to={`/eventos/${eventId}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-forest underline-offset-4 hover:underline"><ArrowLeft size={16} aria-hidden="true" />Volver al evento</Link>
    <header className="mt-5 mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-line pb-7 sm:mt-8">
      <div className="min-w-0"><p className="eyebrow">TU EVENTO · CONFIGURACIÓN</p><h1 className="mt-3 font-display text-4xl tracking-tight text-forest sm:text-5xl">Editar evento<span className="text-clay">.</span></h1><p className="mt-3 max-w-2xl break-words text-sm leading-7 text-muted">Organizá los detalles de <strong className="font-medium text-forest">{event.title}</strong> en un solo lugar.</p></div>
      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#dce3d4] bg-[#edf1e5] px-4 py-2 text-xs font-medium text-forest"><Settings2 size={15} aria-hidden="true" /><span>{TYPE_LABELS[event.type]} · {STATUS_LABELS[event.status]}</span></div>
    </header>
    <EventForm key={event.updated_at} event={event} />
    <EventAccessForm key={`${event.id}:${event.timezone}`} event={event} />
  </section>
}
