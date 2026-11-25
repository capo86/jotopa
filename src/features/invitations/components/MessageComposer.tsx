import {useState} from 'react'
import {useMutation,useQuery} from '@tanstack/react-query'
import {appUrl} from '../../../lib/env'
import {manualAction,prepareMessage} from '../api'
import type {ActionRequest} from '../api'
import {invitationOperationError} from '../models'
import type {QueueGuest} from '../models'
import {renderMessage,whatsappChannel} from '../channels'

export type MarkedDelivery={guestId:string;name:string;requestId:string}
export function MessageComposer({eventId,guest,templateId,onChanged,onMarked,onNotice}:{eventId:string;guest:QueueGuest;templateId:string;onChanged:()=>Promise<void>;onMarked:(value:MarkedDelivery)=>void;onNotice:(value:string)=>void}){
  const [working,setWorking]=useState(false)
  const query=useQuery({queryKey:['invitation-compose',eventId,guest.guest_id,templateId],queryFn:({signal})=>prepareMessage(eventId,guest.guest_id,templateId,signal),retry:false,gcTime:0,refetchOnWindowFocus:false})
  const mutation=useMutation({mutationFn:(request:ActionRequest)=>manualAction(eventId,guest.guest_id,request,templateId),retry:false,gcTime:0})
  const correction=useMutation({mutationFn:(referenceId:string)=>manualAction(eventId,guest.guest_id,{action:'failed',requestId:crypto.randomUUID(),referenceId}),retry:false,gcTime:0})
  let preview='',previewError=''
  if(query.data){try{const message=renderMessage(query.data,appUrl);preview=message.text.split(message.link).join('[tu enlace personal]')}catch(error){previewError=invitationOperationError(error)}}
  const perform=async(action:'send'|'copy_message'|'copy_link'|'shared'|'skip'|'failed')=>{
    setWorking(true);onNotice('')
    const requestId=crypto.randomUUID()
    let popup:Window|null=null,marked=false
    try{
      if(action==='send'){
        popup=window.open('about:blank','_blank')
        if(!popup){await mutation.mutateAsync({action:'failed',requestId});onNotice(invitationOperationError(new Error('popup_blocked')));await onChanged();return}
        popup.opener=null
        popup.document.title='Preparando WhatsApp'
        popup.document.body.textContent='Preparando tu mensaje. Todavía no se envió nada.'
      }
      const result=await mutation.mutateAsync({action,requestId})
      if(action==='send'){
        marked=true
        if(!result.payload)throw new Error('connection_error')
        if(!popup || popup.closed)throw new Error('popup_closed')
        popup.location.replace(whatsappChannel.createUrl(renderMessage(result.payload,appUrl)))
        onMarked({guestId:guest.guest_id,name:guest.full_name,requestId})
        onNotice('WhatsApp abierto y envío marcado manualmente. Falta que toques Enviar en WhatsApp; no confirma entrega ni lectura.')
        await onChanged()
      }else if(action==='copy_message'||action==='copy_link'){
        if(!result.payload || !navigator.clipboard)throw new Error('clipboard_unavailable')
        const message=renderMessage(result.payload,appUrl)
        try{await navigator.clipboard.writeText(action==='copy_link'?message.link:message.text)}catch{throw new Error('clipboard_unavailable')}
        onNotice(action==='copy_link'?'Enlace copiado. Todavía no se marcó enviado.':'Mensaje copiado. Compartilo y después marcá que ya compartiste el enlace.')
      }else{
        if(action==='shared')onMarked({guestId:guest.guest_id,name:guest.full_name,requestId})
        onNotice(action==='shared'?'Enlace marcado como compartido manualmente.':action==='skip'?'Persona saltada. Podés retomarla desde Saltadas.':'Intento registrado como No se pudo. Podés retomarlo desde esa cola.')
        await onChanged()
      }
    }catch(error){
      popup?.close()
      if(marked){
        try{await correction.mutateAsync(requestId);await onChanged()}
        catch{onMarked({guestId:guest.guest_id,name:guest.full_name,requestId})}
      }else if(action==='send' && !(typeof error==='object' && error && 'code'in error && error.code)){
        // A lost response can leave an uncertain server commit. Keep its UUID
        // available for explicit undo, without retrying an external action.
        onMarked({guestId:guest.guest_id,name:guest.full_name,requestId})
      }
      onNotice(invitationOperationError(error))
    }finally{setWorking(false)}
  }
  const disabled=working||query.isFetching||query.isError||Boolean(previewError)
  return <section aria-labelledby="composer-title" className="min-w-0 rounded-2xl border border-line bg-paper p-5 sm:p-7"><p className="eyebrow">AHORA EN TU COLA</p><h2 id="composer-title" className="mt-3 break-words font-display text-3xl text-forest">{guest.full_name}</h2><p className="mt-2 text-xs text-muted">{guest.phone_state==='valid'?guest.phone:guest.phone_state==='missing'?'Sin teléfono · podés copiar el mensaje y su enlace':'Teléfono inválido · corregilo en Invitados o usá copiar'}</p>
    {query.isFetching?<p role="status" className="py-8 text-sm text-muted">Personalizando el mensaje…</p>:null}
    {query.isError||previewError?<div role="alert" className="my-5 text-sm leading-6 text-clay">{previewError||invitationOperationError(query.error)}<button type="button" className="mt-2 block min-h-11 underline" onClick={()=>{void query.refetch()}}>Volver a intentar</button></div>:null}
    {preview && !query.isError?<blockquote className="my-6 whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-[#d5ddc8] bg-[#eef2e5] px-5 py-5 text-sm leading-7 text-forest">{preview}</blockquote>:null}
    <p className="mb-5 text-xs leading-6 text-muted">El enlace real se completa al copiar o abrir WhatsApp. Abrir WhatsApp marca un intento manual: no sabemos si se envió, llegó o fue leído.</p>
    {guest.queue_state==='pending'?<div className="space-y-3"><button type="button" className="button-primary w-full" disabled={disabled||guest.phone_state!=='valid'} onClick={()=>{void perform('send')}}>{working?'Procesando…':'Abrir WhatsApp y marcar enviada'}</button><div className="grid gap-3 sm:grid-cols-2"><button type="button" className="min-h-11 rounded-lg border border-sand px-3 text-sm text-forest" disabled={disabled} onClick={()=>{void perform('copy_message')}}>Copiar mensaje</button><button type="button" className="min-h-11 rounded-lg border border-sand px-3 text-sm text-forest" disabled={disabled} onClick={()=>{void perform('copy_link')}}>Copiar enlace</button></div><button type="button" className="min-h-11 w-full text-sm text-forest underline underline-offset-4" disabled={disabled} onClick={()=>{void perform('shared')}}>Ya compartí el enlace</button><div className="flex flex-wrap justify-between gap-3 border-t border-line pt-3"><button type="button" className="min-h-11 text-sm text-muted underline" disabled={working} onClick={()=>{void perform('skip')}}>Saltar por ahora</button><button type="button" className="min-h-11 text-sm text-clay underline" disabled={working} onClick={()=>{void perform('failed')}}>No se pudo enviar</button></div></div>:<p className="text-sm leading-7 text-muted">Esta persona está fuera de Pendientes. Usá Retomar en la lista para volver a preparar el envío.</p>}
  </section>
}
