import {requireSupabase} from '../../lib/supabase'
import {actionSchema,historySchema,messagePayloadSchema,queueSchema,templatesSchema,trackingSchema,templateSchema} from './models'
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
