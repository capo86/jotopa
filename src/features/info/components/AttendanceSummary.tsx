import {useQuery} from '@tanstack/react-query'
import {Link} from 'react-router'
import {attendanceSummary} from '../api'
import {seatingError} from '../models'

const labels={invitations:'Invitaciones generadas',authorized_people:'Personas autorizadas',confirmed_invitations:'Invitaciones confirmadas',confirmed_people:'Asistentes confirmados',declined_invitations:'Invitaciones rechazadas',pending_invitations:'Invitaciones pendientes',available_tables:'Mesas disponibles',assigned_people:'Asistentes asignados a mesas'} as const
export function AttendanceSummary({eventId,canViewNames}:{eventId:string;canViewNames:boolean}){
  const query=useQuery({queryKey:['attendance',eventId],queryFn:({signal})=>attendanceSummary(eventId,signal),retry:false})
  return <section id="resumen" className="my-9 border-y border-line py-7" aria-label="Resumen de invitaciones y personas"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-3xl text-forest">Cada invitación, cada persona.</h2><button type="button" className="min-h-11 text-xs text-forest underline" disabled={query.isFetching} onClick={()=>{void query.refetch()}}>Actualizar indicadores</button></div>
    {query.data?<><dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(labels).map(([key,label])=><div key={key} className="rounded-xl border border-line bg-paper p-4"><dt className="text-xs leading-6 text-muted">{label}</dt><dd className="mt-1 font-display text-4xl text-forest">{query.data[key as keyof typeof labels]}</dd>{canViewNames?<Link className="mt-2 inline-flex min-h-11 items-center text-xs text-forest underline" to={key==='available_tables'?'/eventos/'+eventId+'/mesas':'/eventos/'+eventId+'/estadisticas/'+key} aria-label={'Abrir lista: '+label}>{key==='available_tables'?'Ver mesas':'Ver lista →'}</Link>:null}</div>)}</dl><p className="mt-5 text-xs leading-6 text-muted">Los asistentes cuentan personas confirmadas; las listas se agrupan por invitación. Mesas disponibles: sin invitaciones asignadas, de {query.data.total_tables} creadas.</p></>:null}
    {query.isFetching?<p role="status" className="mt-4 text-xs text-muted">Actualizando indicadores…</p>:null}{query.isError?<p role="alert" className="mt-4 text-sm text-clay">{seatingError(query.error)}</p>:null}
  </section>
}