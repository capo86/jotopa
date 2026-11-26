import {useQuery} from '@tanstack/react-query'
import {useParams} from 'react-router'
import {fetchPublicInvitation} from '../api'
import {InvitationPresentation} from '../components/InvitationPresentation'

export function Component(){
  const {slug=''}=useParams()
  const query=useQuery({queryKey:['public-invitation',slug],queryFn:()=>fetchPublicInvitation(slug),enabled:/^[a-z0-9-]{1,100}$/.test(slug),retry:false,refetchInterval:45_000,refetchOnWindowFocus:true})
  if(query.isPending&&query.fetchStatus!=='idle')return <main className="p-10 text-center text-forest" role="status">Preparando la invitación…</main>
  if(!query.data)return <main className="mx-auto max-w-lg p-10 text-center text-forest"><h1 className="font-display text-3xl">Esta invitación no está disponible.</h1><p className="mt-4 text-sm">Revisá el enlace o consultá con el anfitrión.</p></main>
  const {event,design,images}=query.data
  return <main><InvitationPresentation event={event} design={design} guestName="" images={images} rsvp={null} footer={<p>Para confirmar asistencia o compartir tus buenos deseos, usá tu invitación personal.</p>} /></main>
}
