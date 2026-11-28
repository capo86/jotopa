import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {appUrl} from '../../../lib/env'
import {personalInvitationUrl} from '../../guests/index.ts'
import {whatsappChannel} from '../channels'
import {fetchFollowupCandidates,prepareFollowup,recordFollowup} from '../api'
import {invitationOperationError} from '../models'
import type {FollowupPayload} from '../models'

function message(payload:FollowupPayload){
  const link=personalInvitationUrl(appUrl,payload.token)
  const date=new Intl.DateTimeFormat('es-PY',{dateStyle:'long',timeZone:payload.timezone}).format(new Date(payload.deadline))
  const plural=payload.party_size>1
  const text=plural
    ? 'Hola, '+payload.full_name+' 🌿\n\nNos encantaría contar con ustedes. Cuando puedan, confirmen cuántas personas asistirán antes del '+date+'. Su respuesta nos ayuda a preparar todo con cariño.\n\nSu invitación personal: '+link
    : 'Hola, '+payload.full_name+' 🌿\n\nNos encantaría contar con vos. Cuando tengas un momento, confirmá tu asistencia antes del '+date+'. Tu respuesta nos ayuda a preparar todo con cariño.\n\nTu invitación personal: '+link
  return {text,link,phone:payload.phone}
}
export function FollowupWorkspace({eventId}:{eventId:string}){
  const [page,setPage]=useState(0),[selected,setSelected]=useState<FollowupPayload|null>(null),[opened,setOpened]=useState(false),[notice,setNotice]=useState('')
  const cache=useQueryClient()
  const query=useQuery({queryKey:['followup-candidates',eventId,page],queryFn:({signal})=>fetchFollowupCandidates(eventId,page,signal),retry:false})
  const prepare=useMutation({mutationFn:(guestId:string)=>prepareFollowup(eventId,guestId),onSuccess:data=>{setSelected(data);setOpened(false);setNotice('')}})
  const record=useMutation({mutationFn:()=>recordFollowup(eventId,selected!.guest_id,crypto.randomUUID()),onSuccess:async()=>{setSelected(null);setOpened(false);setNotice('Recordatorio registrado. No se ofrecerá un segundo recordatorio a esta persona.');await cache.invalidateQueries({queryKey:['followup-candidates',eventId]})}})
  const open=()=>{if(!selected)return;try{const popup=window.open(whatsappChannel.createUrl(message(selected)),'_blank');if(!popup)throw new Error('popup_blocked');popup.opener=null;setOpened(true);setNotice('Volvé después de tocar Enviar en WhatsApp e indicá si salió.')}catch(error){setNotice(invitationOperationError(error))}}
  const copy=async()=>{if(!selected)return;try{await navigator.clipboard.writeText(message(selected).text);setOpened(true);setNotice('Mensaje copiado. Marcá el recordatorio solo después de compartirlo.')}catch{setNotice('No se pudo copiar el mensaje.')}}
  return <section className="mt-10 rounded-2xl border border-line bg-paper p-5 sm:p-7" aria-labelledby="followup-title"><p className="eyebrow">UNA SEGUNDA INVITACIÓN A RESPONDER</p><h2 id="followup-title" className="mt-2 font-display text-3xl text-forest">Un recordatorio amable.</h2><p className="mt-3 text-sm leading-6 text-muted">Una sola vez por invitación pendiente. Solo aparecen personas que abrieron el enlace o cuyo envío confirmaste, con autorización de contacto vigente. El mensaje se abre manualmente en WhatsApp.</p>
    {notice?<p role="status" className="mt-4 text-sm text-forest">{notice}</p>:null}
    {query.isFetching?<p role="status" className="mt-5 text-sm text-muted">Buscando pendientes…</p>:null}
    {query.isError||prepare.isError||record.isError?<p role="alert" className="mt-4 text-sm text-clay">{invitationOperationError(query.error??prepare.error??record.error)}</p>:null}
    {selected?<div className="mt-5 rounded-xl border border-sand p-4"><p className="font-medium text-forest">{selected.full_name}</p><blockquote className="my-4 whitespace-pre-wrap rounded-xl bg-[#eef2e5] p-4 text-sm leading-7 text-forest">{message(selected).text.replace(message(selected).link,'[enlace personal]')}</blockquote><div className="flex flex-wrap gap-3"><button type="button" className="button-primary" onClick={open} disabled={!selected.phone}>Abrir WhatsApp</button><button type="button" className="min-h-11 text-sm text-forest underline" onClick={()=>{void copy()}}>Copiar mensaje</button><button type="button" className="min-h-11 text-sm text-muted underline" onClick={()=>{setSelected(null);setOpened(false)}}>Cancelar</button></div>{opened?<div className="mt-4 border-t border-line pt-4"><p className="text-sm text-forest">¿Pudiste enviar el recordatorio?</p><button type="button" className="button-primary mt-3" disabled={record.isPending} onClick={()=>record.mutate()}>Sí, lo envié</button><button type="button" className="ml-3 min-h-11 text-sm text-clay underline" onClick={()=>setOpened(false)}>No se pudo</button></div>:null}</div>:null}
    {query.data?<><p className="mt-5 text-xs text-muted">{query.data.total} invitaciones pendientes para recordar</p><ul className="mt-3 divide-y divide-line">{query.data.rows.map(row=><li key={row.guest_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><p className="text-sm text-forest">{row.full_name} · {row.party_size} {row.party_size===1?'persona':'personas'}</p><button type="button" className="min-h-11 text-sm text-forest underline" disabled={prepare.isPending} onClick={()=>prepare.mutate(row.guest_id)}>Preparar mensaje</button></li>)}</ul><div className="mt-3 flex justify-between text-xs"><button type="button" className="min-h-11 underline" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Anterior</button><button type="button" className="min-h-11 underline" disabled={(page+1)*25>=query.data.total} onClick={()=>setPage(value=>value+1)}>Siguiente</button></div></>:null}
  </section>
}