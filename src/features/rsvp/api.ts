import {createClient} from '@supabase/supabase-js'
import type {Database,Json} from '../../lib/database.types'
import {supabaseConfig} from '../../lib/env'
import {InvitationError,parseInvitation,tokenIsValid,responseSchema} from './models'
import type {ResponseValues} from './models'

// Public invitations never reuse the organizer's persisted Auth session.
const client = supabaseConfig ? createClient<Database>(supabaseConfig.url,supabaseConfig.publicKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'jotopa-public-invitation'}}) : null
async function requestInvitation(token:string,request:Json,signal?:AbortSignal) {
  if(!tokenIsValid(token)) throw new InvitationError('invitation_unavailable')
  if(!client) throw new InvitationError('connection_error')
  const pending=client.rpc('guest_invitation',{p_token:token,p_request:request})
  const {data,error}=await (signal ? pending.abortSignal(signal) : pending)
  if(error) throw new InvitationError('connection_error')
  return parseInvitation(data)
}
export const readInvitation = (token:string,signal:AbortSignal,visitId?:string) => requestInvitation(token,{action:'read',...(visitId?{visit_id:visitId}:{})},signal)
export const optOutInvitation = (token:string) => requestInvitation(token,{action:'opt_out'})
export function respondInvitation(token:string,values:ResponseValues) {
  const parsed=responseSchema.safeParse(values)
  if(!parsed.success) throw new InvitationError('invalid_response')
  return requestInvitation(token,{action:'respond',...parsed.data})
}
