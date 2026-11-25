import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { listEvents } from '../api'
import { TYPE_LABELS, STATUS_LABELS } from '../schemas'
import { DataState } from '../../../components/ui/DataState'
import { Icon } from '../../../components/ui/Icon'
import { DEFAULT_LOCALE } from '../../../lib/config'

export function Component() {
  const events = useQuery({ queryKey: ['events'], queryFn: ({ signal }) => listEvents(signal) })
  return <section>
    <div className="mb-9 flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow">CADA ENCUENTRO, SU ESPACIO</p><h1 className="mt-4 font-display text-5xl tracking-tight text-forest">Mis eventos</h1><p className="mt-4 max-w-lg text-sm leading-7 text-muted">Tus celebraciones y los encuentros que organizás en equipo.</p></div><Link to="/eventos/nuevo" className="button-primary"><Icon name="plus" />Crear evento</Link></div>
    {events.isPending || events.isError ? <DataState loading={events.isPending} retry={() => { void events.refetch() }} /> : events.data.length === 0 ? <div className="rounded-2xl border border-dashed border-sand bg-paper px-6 py-14 text-center"><Icon name="calendar" className="mx-auto mb-5 h-8 w-8 text-forest" /><h2 className="text-xl font-medium">Tu próximo encuentro empieza acá</h2><p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted">Creá un evento para empezar a organizarlo. Podés sumar a tu equipo cuando quieras.</p><Link to="/eventos/nuevo" className="button-primary mt-6">Crear mi primer evento</Link></div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{events.data.map(event => <Link key={event.id} to={`/eventos/${event.id}`} className="group rounded-2xl border border-line bg-paper p-6 transition-colors hover:border-forest"><div className="flex flex-wrap justify-between gap-3 text-xs text-muted"><span>{TYPE_LABELS[event.type]}</span><span className="rounded-full bg-canvas px-3 py-1 text-forest">{STATUS_LABELS[event.status]}</span></div><h2 className="mt-6 break-words font-display text-3xl leading-tight text-forest group-hover:underline">{event.title}</h2><p className="mt-5 text-sm text-muted">{new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'long', timeStyle: 'short', timeZone: event.timezone }).format(new Date(event.starts_at))}</p><p className="mt-2 text-xs text-muted">{event.timezone}</p><span className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-forest">Ver evento<Icon name="arrow" /></span></Link>)}</div>}
  </section>
}
