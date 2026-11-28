import {PartyDetails} from './PartyDetails'
import {useQuery} from '@tanstack/react-query'
import {signInvitationAudio} from '../../invitation-design/api'
import type {ReactNode} from 'react'
import {InvitationPresentation} from '../../invitation-design/presentation'
import type {AssetImages,InvitationDesign} from '../../invitation-design'
import type {Invitation} from '../models'

export function PublishedInvitation({token,design,invitation,images,imageError,onRetryImages,rsvp,footer,wall}:{token:string;design:InvitationDesign;invitation:Invitation;images:AssetImages;imageError:boolean;onRetryImages:()=>void;rsvp:ReactNode;footer:ReactNode;wall?:ReactNode}){
  const music=useQuery({queryKey:['personal-invitation-audio',design.music_asset_id],queryFn:()=>signInvitationAudio(design.music_asset_id!,{token}),enabled:Boolean(design.music_asset_id),retry:false,gcTime:0,refetchInterval:480_000})
  return <>{imageError?<div role="status" className="bg-paper px-5 py-3 text-center text-xs leading-6 text-forest">No pudimos cargar las fotos. Tu confirmación sigue disponible. <button type="button" className="min-h-11 underline" onClick={onRetryImages}>Volver a cargar fotografías</button></div>:null}<InvitationPresentation design={design} event={invitation.event} guestName={invitation.guest.full_name} partySize={invitation.guest.party_size} images={images} musicUrl={music.data} rsvp={rsvp} rsvpStatus={invitation.guest.rsvp_status} personalDetails={<PartyDetails invitation={invitation} />} footer={footer} wall={wall} onImageError={onRetryImages} /></>
}