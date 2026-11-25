import {useQuery} from '@tanstack/react-query'
import {fetchTracking} from './api'
export function useGuestInvitationTracking(eventId:string,guestIds:string[],enabled:boolean){return useQuery({queryKey:['invitation-tracking',eventId,guestIds],queryFn:({signal})=>fetchTracking(eventId,guestIds,signal),enabled:enabled && guestIds.length>0,retry:false})}
