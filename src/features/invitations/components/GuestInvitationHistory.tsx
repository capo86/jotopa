import {RsvpHistoryDetails} from './RsvpHistoryDetails'
import {useEffect,useRef,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {fetchHistory} from '../api'
import {invitationOperationError} from '../models'

const labels:Record<string,string>={sent:'Marcada como enviada manualmente',sent_undone:'Marca de envío deshecha',opened:'Apertura del enlace personal',rsvp:'Respuesta de asistencia',skipped:'Saltada en la cola',failed:'No se pudo enviar',resumed:'Devuelta a pendientes',copy_requested:'Solicitud de copiar mensaje',link_copy_requested:'Solicitud de copiar enlace'}
export function GuestInvitationHistory({eventId,guestId,name,timezone,onClose}:{eventId:string;guestId:string;name:string;timezone:string;onClose:()=>void}){
  const [page,setPage]=useState(0)
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[])
  const query=useQuery({queryKey:['invitation-history',eventId,guestId,page],queryFn:({signal})=>fetchHistory(eventId,guestId,page,signal),retry:false})
  const data=query.data
  return <dialog ref={ref} onCancel={onClose} aria-labelledby="invitation-history-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-paper p-5 text-forest shadow-xl backdrop:bg-forest/30 sm:p-8"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="eyebrow">LÍNEA DE TIEMPO</p><h2 id="invitation-history-title" className="mt-2 break-words font-display text-3xl">{name}</h2></div><button type="button" className="min-h-11 text-sm underline" onClick={onClose}>Cerrar</button></div><p className="mt-4 text-xs leading-6 text-muted">Abrir WhatsApp no confirma entrega ni lectura. Las aperturas registradas corresponden al enlace personal y se agrupan durante 60 segundos.</p>
    <button className="mt-3 min-h-11 text-xs underline" type="button" disabled={query.isFetching} onClick={()=>{void query.refetch()}}>Actualizar historial</button>
    {query.isFetching?<p role="status" className="my-6 text-sm">Cargando historial…</p>:null}{query.isError?<p role="alert" className="mt-5 text-sm text-clay">{invitationOperationError(query.error)}</p>:null}
    {data && !query.isFetching?<><ol className="mt-3 divide-y divide-line">{data.rows.map(entry=><li key={entry.id} className="relative border-l border-sand py-5 pl-5"><span aria-hidden="true" className="absolute -left-1 top-7 size-2 rounded-full bg-clay" /><p className="text-sm font-medium">{labels[entry.type] ?? 'Acción de invitación'}</p>{entry.type==='rsvp'?<RsvpHistoryDetails meta={entry.meta} />:null}{entry.type==='sent'?<p className="mt-2 text-xs text-muted">{entry.channel==='whatsapp'?'Apertura manual de WhatsApp':'Compartida por enlace, según el anfitrión'}</p>:null}<time dateTime={entry.occurred_at} className="mt-2 block text-xs leading-5 text-muted">{new Intl.DateTimeFormat('es-PY',{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(entry.occurred_at))}</time></li>)}</ol>{!data.total?<p className="py-8 text-sm text-muted">Todavía no hay acciones de invitación registradas.</p>:null}<nav aria-label="Paginación del historial" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs"><span>Página {page+1} de {Math.max(1,Math.ceil(data.total/25))}</span><div className="flex gap-3"><button type="button" className="min-h-11 px-2 underline" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Anterior</button><button type="button" className="min-h-11 px-2 underline" disabled={(page+1)*25>=data.total} onClick={()=>setPage(value=>value+1)}>Siguiente</button></div></nav></>:null}
  </dialog>
}
