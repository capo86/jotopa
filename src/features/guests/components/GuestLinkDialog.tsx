import {useEffect,useRef,useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {requireSupabase} from '../../../lib/supabase'
import {appUrl} from '../../../lib/env'
import {guestError} from '../models'
import {invitationQr,personalInvitationUrl} from '../qr'

export function GuestLinkDialog({eventId,guestId,name,onClose}:{eventId:string;guestId:string;name:string;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null)
  const [notice,setNotice]=useState('')
  const cache=useQueryClient()
  const key=['guest-personal-link',eventId,guestId]
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close()},[])
  const load=async(rotate=false)=>{
    const {data,error}=await requireSupabase().rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestId,p_rotate:rotate})
    if(error) throw error
    const url=personalInvitationUrl(appUrl,data)
    return {url,qr:await invitationQr(url)}
  }
  const query=useQuery({queryKey:key,queryFn:()=>load(),gcTime:0,staleTime:Infinity,retry:false,refetchOnWindowFocus:false})
  const rotation=useMutation({mutationFn:()=>load(true),retry:false,gcTime:0,onSuccess:data=>{cache.setQueryData(key,data);setNotice('Enlace regenerado. El enlace y el QR anteriores dejaron de funcionar.')}})
  const busy=query.isFetching || rotation.isPending
  const result=query.isError || rotation.isError ? undefined : query.data
  return <dialog ref={ref} onCancel={event=>{if(rotation.isPending) event.preventDefault();else onClose()}} aria-labelledby="guest-link-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-paper p-5 text-forest shadow-xl backdrop:bg-forest/30 sm:p-7"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="eyebrow">INVITACIÓN PERSONAL</p><h2 id="guest-link-title" className="mt-2 break-words font-display text-2xl">{name}</h2></div><button type="button" className="min-h-11 px-2 text-sm underline" disabled={rotation.isPending} onClick={onClose}>Cerrar</button></div>
    <p className="mt-4 text-xs leading-6 text-muted">El enlace da acceso solo a esta invitación, cuando el evento está activo y dentro de su período de acceso. Compartilo únicamente con esta persona.</p>
    {busy?<p role="status" className="py-8 text-sm">Preparando enlace y QR…</p>:null}
    {query.isError || rotation.isError?<div role="alert" className="mt-4 text-sm text-clay"><p>{guestError(query.error ?? rotation.error)}</p><button type="button" className="mt-2 min-h-11 underline" onClick={()=>{rotation.reset();void query.refetch()}}>Volver a intentar</button></div>:null}
    {result && !busy?<><img src={result.qr} alt="Código QR de la invitación personal" width={256} height={256} className="mx-auto my-5 h-auto w-64 max-w-full rounded-lg border border-line bg-white" /><div className="grid gap-3"><button type="button" className="button-primary" onClick={()=>{
      void navigator.clipboard?.writeText(result.url).then(()=>setNotice('Enlace copiado.')).catch(()=>setNotice('El navegador no permitió copiar. Revisá los permisos del portapapeles o descargá el QR.'))
      if(!navigator.clipboard) setNotice('La copia requiere un navegador con portapapeles seguro. Podés descargar el QR.')
    }}>Copiar enlace</button><a href={result.qr} download={`jotopa-invitacion-${guestId.slice(0,8)}.png`} className="flex min-h-11 items-center justify-center rounded-lg border border-sand px-4 text-sm">Descargar QR</a></div><details className="mt-6 text-xs leading-6 text-muted"><summary className="cursor-pointer text-clay">Regenerar enlace personal</summary><p className="mt-2">El enlace y el QR actuales dejarán de funcionar. La respuesta RSVP se conserva. Vas a tener que compartir el nuevo enlace.</p><button type="button" className="mt-2 min-h-11 text-clay underline" onClick={()=>rotation.mutate()}>Confirmar nuevo enlace</button></details></>:null}
    {notice?<p role="status" className="mt-4 text-sm leading-6">{notice}</p>:null}
  </dialog>
}
