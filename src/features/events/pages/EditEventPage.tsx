import { Link, useParams } from 'react-router'
import { useEvent } from '../hooks'
import { hasPermission } from '../../../lib/permissions'
import { DataState } from '../../../components/ui/DataState'
import { EventForm } from '../components/EventForm'

export function Component() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  if (!query.data || !hasPermission(query.data.role, 'event.update')) return <DataState loading={query.isFetching} />
  return <section className="max-w-3xl"><Link to={`/eventos/${eventId}`} className="text-sm text-forest underline underline-offset-4">Volver al evento</Link><h1 className="mt-7 font-display text-5xl tracking-tight text-forest">Editar evento</h1><p className="mt-4 mb-8 text-sm leading-7 text-muted">Actualizá los datos de {query.data.event.title}.</p><EventForm key={query.data.event.updated_at} event={query.data.event} /></section>
}
