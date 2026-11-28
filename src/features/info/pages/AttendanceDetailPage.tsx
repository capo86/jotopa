import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Link,useParams} from 'react-router'
import {DataState} from '../../../components/ui/DataState'
import {useEvent} from '../../events/hooks'
import {hasPermission} from '../../../lib/permissions'
import {guestDrilldown} from '../api'
import {seatingError} from '../models'

const labels:Record<string,string>={invitations:'Invitaciones generadas',authorized_people:'Personas autorizadas',confirmed_invitations:'Invitaciones confirmadas',confirmed_people:'Asistentes confirmados',declined_invitations:'Invitaciones rechazadas',pending_invitations:'Invitaciones pendientes',assigned_people:'Asistentes asignados a mesas'}
export function Component(){
  const {eventId='',metric=''}=useParams()
  const [page,setPage]=useState(0)
  const eventQuery=useEvent(eventId)
  const role=eventQuery.data?.role
  const allowed=Boolean(role&&hasPermission(role,'dashboard.read')&&hasPermission(role,'guests.read'))
  const label=labels[metric]
  const query=useQuery({queryKey:['attendance-details',eventId,metric,page],queryFn:({signal})=>guestDrilldown(eventId,metric,page,signal),enabled:Boolean(eventQuery.data&&allowed&&label),retry:false})
  if(!eventQuery.data)return <DataState loading={eventQuery.isFetching} retry={()=>{void eventQuery.refetch()}} />
  if(!allowed)return <section className="max-w-4xl"><h1 className="font-display text-4xl text-forest">Lista no disponible</h1><p className="mt-4 text-sm text-muted">Tu rol puede ver los indicadores, pero no los nombres de invitados.</p><Link to={'/eventos/'+eventId+'#resumen'} className="mt-5 inline-flex min-h-11 items-center text-sm text-forest underline">Volver al resumen</Link></section>
  if(!label)return <section className="max-w-4xl"><h1 className="font-display text-4xl text-forest">Indicador no disponible</h1><Link to={'/eventos/'+eventId+'#resumen'} className="mt-5 inline-flex min-h-11 items-center text-sm text-forest underline">Volver al resumen</Link></section>
  return <section className="max-w-5xl"><Link to={'/eventos/'+eventId+'#resumen'} className="inline-flex min-h-11 items-center text-sm text-forest underline">← Volver al resumen</Link><p className="eyebrow mt-6">{eventQuery.data.event.title} · ESTADÍSTICAS</p><h1 className="mt-3 font-display text-4xl text-forest sm:text-5xl">{label}</h1><p className="mt-3 text-sm leading-6 text-muted">Cada fila corresponde a una invitación. Si incluye acompañantes, mostramos cuántas personas confirmaron.</p>
    {query.isFetching?<p role="status" className="mt-8 text-sm text-muted">Cargando la lista…</p>:null}
    {query.isError?<div role="alert" className="mt-6 text-sm text-clay">{seatingError(query.error)} <button type="button" className="ml-2 min-h-11 underline" onClick={()=>{void query.refetch()}}>Reintentar</button></div>:null}
    {query.data?<><p className="mt-7 text-sm font-medium text-forest">{query.data.total} invitaciones en esta lista</p>{query.data.total===0?<p className="mt-4 rounded-xl border border-dashed border-line p-6 text-sm text-muted">Todavía no hay personas en este indicador.</p>:<ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper px-5 sm:px-7">{query.data.rows.map(row=><li key={row.id} className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-5"><div className="min-w-0"><h2 className="break-words text-sm font-semibold text-forest">{row.full_name}</h2><p className="mt-1 text-xs text-muted">Invitación para {row.party_size} {row.party_size===1?'persona':'personas'}</p></div><div className="text-xs leading-6 text-muted">{row.rsvp_status==='yes'?<><span className="font-medium text-forest">{row.attending_count} {row.attending_count===1?'asistente confirmado':'asistentes confirmados'}</span>{row.table_name?<span className="block">Mesa: {row.table_name}</span>:null}</>:row.rsvp_status==='no'?'No asiste':'Respuesta pendiente'}</div></li>)}</ul>}<nav aria-label="Páginas de invitados" className="mt-5 flex items-center justify-between text-sm text-forest"><button type="button" className="min-h-11 underline disabled:opacity-40" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Anterior</button><span>Página {page+1} de {Math.max(1,Math.ceil(query.data.total/25))}</span><button type="button" className="min-h-11 underline disabled:opacity-40" disabled={(page+1)*25>=query.data.total} onClick={()=>setPage(value=>value+1)}>Siguiente</button></nav></>:null}
  </section>
}