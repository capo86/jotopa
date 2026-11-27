import {PartyDetails} from './PartyDetails'
import {useQuery} from '@tanstack/react-query'
import type {ReactNode} from 'react'
import {InvitationPresentation,publicAssetImages} from '../../invitation-design/presentation'
import type {InvitationDesign} from '../../invitation-design'
import type {Invitation} from '../models'

export function PublishedInvitation({token,design,invitation,rsvp,footer,wall}:{token:string;design:InvitationDesign;invitation:Invitation;rsvp:ReactNode;footer:ReactNode;wall?:ReactNode}){
  const images=useQuery({queryKey:['personal-invitation-images',design.cover_asset_id,...design.gallery.map(photo=>photo.asset_id)],queryFn:()=>publicAssetImages(token),retry:false,gcTime:0,refetchInterval:45_000,refetchOnWindowFocus:true})
  return <>{images.isError?<div role="status" className="bg-paper px-5 py-3 text-center text-xs leading-6 text-forest">No pudimos cargar las fotos. Tu confirmación sigue disponible. <button type="button" className="min-h-11 underline" onClick={()=>{void images.refetch()}}>Volver a cargar fotografías</button></div>:null}<InvitationPresentation design={design} event={invitation.event} guestName={invitation.guest.full_name} partySize={invitation.guest.party_size} images={images.data??{}} rsvp={rsvp} personalDetails={<PartyDetails invitation={invitation} />} footer={footer} wall={wall} /></>
}
