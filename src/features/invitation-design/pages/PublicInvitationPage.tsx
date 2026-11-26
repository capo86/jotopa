import {useQuery} from '@tanstack/react-query'
import {Link,useParams} from 'react-router'
import {fetchPublicInvitation} from '../api'
import {InvitationPresentation} from '../components/InvitationPresentation'

export function Component(){
  const {slug=''}=useParams()
  const query=useQuery({queryKey:['public-invitation',slug],queryFn:()=>fetchPublicInvitation(slug),enabled:/^[a-z0-9-]{1,100}$/.test(slug),retry:false,refetchInterval:45_000,refetchOnWindowFocus:true})
  if(query.isPending&&query.fetchStatus!=='idle')return <main className="p-10 text-center text-forest" role="status">Preparando la invitación…</main>
  if(!query.data)return <main className="mx-auto max-w-lg p-10 text-center text-forest"><h1 className="font-display text-3xl">Esta invitación no está disponible.</h1><p className="mt-4 text-sm">Revisá el enlace o consultá con el anfitrión.</p></main>
  const {event,design,images}=query.data
  const wall=<section id="buenos-deseos" className="iv-section iv-welcome"><p className="iv-kicker">PALABRAS QUE SE QUEDAN</p><h2>Dejá tus <em>buenos deseos.</em></h2><p className="iv-prose">Compartí un mensaje, fotografías o una nota de voz desde tu invitación personal. No necesitás confirmar asistencia para participar.</p><Link className="iv-personal-entry" to={`/e/${slug}/participar`}>Abrir mi invitación personal <span aria-hidden="true">↗</span></Link></section>
  return <main><InvitationPresentation event={event} design={design} guestName="" images={images} rsvp={null} wall={wall} footer={<p>Para confirmar asistencia, usá tu invitación personal.</p>} /></main>
}
