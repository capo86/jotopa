import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {correctDelivery,fetchDeliveryReview} from '../api'
import {invitationOperationError} from '../models'

export function DeliveryReview({eventId}:{eventId:string}){
  const [page,setPage]=useState(0),[notice,setNotice]=useState('')
  const cache=useQueryClient()
  const query=useQuery({queryKey:['delivery-review',eventId,page],queryFn:({signal})=>fetchDeliveryReview(eventId,page,signal),retry:false})
  const correction=useMutation({mutationFn:(guestId:string)=>correctDelivery(eventId,guestId),onSuccess:async()=>{setNotice('Marca corregida. La invitación aparece en No se pudo para retomarla.');await Promise.all([cache.invalidateQueries({queryKey:['delivery-review',eventId]}),cache.invalidateQueries({queryKey:['invitation-queue',eventId]}),cache.invalidateQueries({queryKey:['invitation-tracking',eventId]})])}})
  return <section className="mt-10 rounded-2xl border border-line bg-paper p-5 sm:p-7" aria-labelledby="review-title"><p className="eyebrow">REVISIÓN DE ENVÍOS</p><h2 id="review-title" className="mt-2 font-display text-3xl text-forest">¿WhatsApp no dejó enviar?</h2><p className="mt-3 text-sm leading-6 text-muted">Revisá las invitaciones marcadas como enviadas que todavía no fueron abiertas. Las marcas anteriores a esta corrección figuran sin verificar. Si WhatsApp bloqueó el envío, devolvelas a la cola sin borrar el historial.</p>
    {notice?<p role="status" className="mt-4 text-sm text-forest">{notice}</p>:null}
    {query.isFetching?<p role="status" className="mt-5 text-sm text-muted">Buscando envíos…</p>:null}
    {query.isError||correction.isError?<p role="alert" className="mt-4 text-sm text-clay">{invitationOperationError(query.error??correction.error)}</p>:null}
    {query.data?<><p className="mt-5 text-xs text-muted">{query.data.total} envíos sin apertura</p><ul className="mt-3 divide-y divide-line">{query.data.rows.map(row=><li key={row.guest_id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium text-forest">{row.full_name}</p><p className="text-xs text-muted">{row.delivery_confirmed_at?'Confirmado manualmente':'Marca antigua sin verificar'} · {new Intl.DateTimeFormat('es-PY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(row.sent_at))}</p></div><button type="button" className="min-h-11 text-sm text-clay underline" disabled={correction.isPending} onClick={()=>correction.mutate(row.guest_id)}>No se pudo enviar</button></li>)}</ul><div className="mt-3 flex justify-between text-xs"><button type="button" className="min-h-11 underline" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Anterior</button><button type="button" className="min-h-11 underline" disabled={(page+1)*25>=query.data.total} onClick={()=>setPage(value=>value+1)}>Siguiente</button></div></>:null}
  </section>
}