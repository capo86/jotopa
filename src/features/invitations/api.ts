import {requireSupabase} from '../../lib/supabase'
import {actionSchema,historySchema,messagePayloadSchema,queueSchema,templatesSchema,trackingSchema,templateSchema,deliveryReviewSchema,followupCandidatesSchema,followupPayloadSchema} from './models'
import type {ManualAction} from './models'

export async function fetchTemplates(eventId:string,signal:AbortSignal){
  const {data,error}=await requireSupabase().from('message_templates').select('id,event_id,name,body,location_label,channel,created_at,updated_at').eq('event_id',eventId).is('archived_at',null).order('created_at').abortSignal(signal)
  if(error) throw error
  return templatesSchema.parse(data)
}
export async function saveTemplate(eventId:string,values:unknown,id?:string){
  const payload=templateSchema.parse(values)
  const {data,error}=await requireSupabase().rpc('save_message_template',{p_event_id:eventId,p_name:payload.name,p_body:payload.body,p_location_label:payload.location_label,...(id?{p_template_id:id}:{})})
  if(error) throw error
  return data
}
export async function archiveTemplate(eventId:string,id:string){const {error}=await requireSupabase().rpc('archive_message_template',{p_event_id:eventId,p_template_id:id});if(error) throw error}
export async function fetchQueue(eventId:string,bucket:string,page:number,signal:AbortSignal){
  const {data,error}=await requireSupabase().rpc('list_invitation_queue',{p_event_id:eventId,p_bucket:bucket,p_page:page}).abortSignal(signal)
  if(error) throw error
  return queueSchema.parse(data)
}
export async function prepareMessage(eventId:string,guestId:string,templateId:string,signal:AbortSignal){
  const {data,error}=await requireSupabase().rpc('prepare_invitation_message',{p_event_id:eventId,p_guest_id:guestId,p_template_id:templateId}).abortSignal(signal)
  if(error) throw error
  return messagePayloadSchema.parse(data)
}
export type ActionRequest={action:ManualAction;requestId:string;referenceId?:string}
export async function manualAction(eventId:string,guestId:string,request:ActionRequest,templateId?:string){
  const {data,error}=await requireSupabase().rpc('manual_invitation_action',{p_event_id:eventId,p_guest_id:guestId,p_action:request.action,p_request_id:request.requestId,...(request.referenceId?{p_reference_id:request.referenceId}:{}),...(templateId?{p_template_id:templateId}:{})})
  if(error) throw error
  return actionSchema.parse(data)
}
export async function fetchTracking(eventId:string,guestIds:string[],signal:AbortSignal){const {data,error}=await requireSupabase().rpc('get_guest_invitation_tracking',{p_event_id:eventId,p_guest_ids:guestIds}).abortSignal(signal);if(error) throw error;return trackingSchema.parse(data)}
export async function fetchHistory(eventId:string,guestId:string,page:number,signal:AbortSignal){const {data,error}=await requireSupabase().rpc('get_guest_invitation_history',{p_event_id:eventId,p_guest_id:guestId,p_page:page}).abortSignal(signal);if(error) throw error;return historySchema.parse(data)}

export async function confirmManualSend(eventId:string,guestId:string,requestId:string,templateId:string){
  const {data,error}=await requireSupabase().rpc('confirm_manual_invitation_sent',{p_event_id:eventId,p_guest_id:guestId,p_request_id:requestId,p_template_id:templateId})
  if(error)throw error
  return actionSchema.parse(data)
}
export async function fetchDeliveryReview(eventId:string,page:number,signal:AbortSignal){
  const {data,error}=await requireSupabase().rpc('list_delivery_review',{p_event_id:eventId,p_page:page}).abortSignal(signal)
  if(error)throw error
  return deliveryReviewSchema.parse(data)
}
export async function correctDelivery(eventId:string,guestId:string){
  const {error}=await requireSupabase().rpc('correct_manual_delivery',{p_event_id:eventId,p_guest_id:guestId,p_request_id:crypto.randomUUID()})
  if(error)throw error
}
export async function fetchFollowupCandidates(eventId:string,page:number,signal:AbortSignal){
  const {data,error}=await requireSupabase().rpc('list_rsvp_followup_candidates',{p_event_id:eventId,p_page:page}).abortSignal(signal)
  if(error)throw error
  return followupCandidatesSchema.parse(data)
}
export async function prepareFollowup(eventId:string,guestId:string){
  const {data,error}=await requireSupabase().rpc('prepare_rsvp_followup',{p_event_id:eventId,p_guest_id:guestId})
  if(error)throw error
  return followupPayloadSchema.parse(data)
}
export async function recordFollowup(eventId:string,guestId:string,requestId:string){
  const {error}=await requireSupabase().rpc('record_rsvp_followup',{p_event_id:eventId,p_guest_id:guestId,p_request_id:requestId})
  if(error)throw error
}