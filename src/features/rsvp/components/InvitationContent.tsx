import {lazy,Suspense,useEffect} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {readInvitation,optOutInvitation} from '../api'
import {invitationErrorMessage} from '../models'
import {PartyDetails} from './PartyDetails'
import {RsvpPanel} from './RsvpPanel'
import {PublishedInvitation} from './PublishedInvitation'
import {Brand} from '../../../components/ui/Brand'
import {publicAssetImages} from '../../invitation-design/presentation'

const GuestWall=lazy(()=>import('../../wall/guest').then(module=>({default:module.GuestWall})))

export function InvitationContent({token,visitId}:{token:string;visitId:string}) {
  const cache=useQueryClient()
  const query=useQuery({queryKey:['personal-invitation'],queryFn:({signal})=>readInvitation(token,signal,visitId),retry:false,staleTime:10_000,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false})
  const images=useQuery({queryKey:['personal-invitation-images'],queryFn:()=>publicAssetImages(token),enabled:query.data?.presentation!==null,retry:false,staleTime:40_000,gcTime:0,refetchOnWindowFocus:false})
  const out=useMutation({mutationFn:()=>optOutInvitation(token),retry:false,gcTime:0,onSuccess:data=>cache.setQueryData(['personal-invitation'],data)})
  const data=query.data
  const refetch=query.refetch
  useEffect(()=>{
    if(!data) return
    const now=Date.parse(data.server_time)
    const next=[data.event.session_closes_at,...(data.event.rsvp_deadline?[data.event.rsvp_deadline]:[])].map(Date.parse).filter(value=>value>now).sort((a,b)=>a-b)[0]
    if(next===undefined) return
    const timeout=setTimeout(()=>{void refetch()},Math.min(2_000_000_000,Math.max(50,next-now+50)))
    return ()=>clearTimeout(timeout)
  },[data,refetch])
  if(query.isError) return <div role="alert" className="px-6 py-14 text-center"><h1 className="font-display text-3xl text-forest">Tu invitación</h1><p className="mt-5 text-sm leading-7 text-muted">{invitationErrorMessage(query.error)}</p><button className="mt-5 min-h-11 text-sm text-forest underline" type="button" onClick={()=>{void query.refetch()}}>Volver a intentar</button></div>
  if(!data) return <p role="status" className="p-12 text-center text-sm text-muted">Preparando tu invitación…</p>
  const {event,guest}=data
  const date=(value:string)=>new Intl.DateTimeFormat('es-PY',{dateStyle:'long',timeStyle:'short',timeZone:event.timezone}).format(new Date(value))
  const rsvp=<RsvpPanel token={token} invitation={data} />
  const wall=<Suspense fallback={<p role="status" className="p-10 text-center text-sm">Preparando los buenos deseos…</p>}><GuestWall token={token} recipient={guest.full_name} partySize={guest.party_size} timezone={event.timezone} /></Suspense>
  const privacy=<>
      <div className="mt-10 border-t border-line pt-6"><p className="text-xs leading-6 text-muted">Este enlace es personal. Compartilo solo con quien organiza el evento.</p>{guest.opted_out?<p role="status" className="mt-3 text-sm leading-6 text-forest">Tu preferencia quedó guardada: no recibir más recordatorios de este evento.</p>:<button type="button" className="mt-2 min-h-11 text-left text-xs leading-6 text-muted underline underline-offset-4" disabled={out.isPending} onClick={()=>out.mutate()}>{out.isPending?'Guardando preferencia…':'No quiero recibir más recordatorios de este evento'}</button>}{out.isError?<p role="alert" className="mt-3 text-xs leading-6 text-clay">{invitationErrorMessage(out.error)}</p>:null}</div>
  </>
  if(data.presentation)return <PublishedInvitation token={token} design={data.presentation} invitation={data} images={images.data??{}} imageError={images.isError} onRetryImages={()=>{void images.refetch()}} rsvp={rsvp} footer={privacy} wall={wall} />
  return <div className="min-h-screen px-4 py-7 sm:py-10"><a href="#legacy-rsvp" className="fixed bottom-4 left-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-forest bg-forest px-5 text-xs font-semibold text-paper shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest" aria-label="Ir a confirmar asistencia"><span aria-hidden="true">✉</span>Confirmar asistencia</a><div className="mx-auto mb-7 flex max-w-2xl justify-center"><Brand /></div><article className="mx-auto max-w-2xl overflow-hidden rounded-t-[3rem] rounded-b-2xl border border-line bg-paper shadow-sm sm:rounded-t-[5rem]">
    <header className="invitation-cover px-6 pt-12 pb-10 text-center sm:px-12 sm:pt-16"><p className="eyebrow">HAY ENCUENTROS QUE MERECEN COMPARTIRSE</p><div aria-hidden="true" className="mx-auto my-8 flex w-fit -space-x-3"><span className="h-16 w-10 -rotate-12 rounded-t-full bg-clay/80" /><span className="h-16 w-10 rotate-12 rounded-t-full bg-forest/65" /></div><p className="text-sm text-forest">{guest.full_name}, te invitamos a</p><h1 className="mt-4 break-words font-display text-4xl leading-tight tracking-tight text-forest sm:text-6xl">{event.title}</h1><p className="mx-auto mt-6 max-w-md text-sm leading-7 text-forest">{date(event.starts_at)}</p></header>
    <PartyDetails invitation={data} />{wall}<div id="legacy-rsvp" className="scroll-mt-6 px-6 py-8 sm:px-12 sm:py-10">{rsvp}</div><div className="px-6 pb-8 sm:px-12">{privacy}</div>
    </article><footer className="mx-auto mt-7 max-w-2xl text-center text-xs text-muted">Jotopa · Nos encontramos.</footer></div>
}
