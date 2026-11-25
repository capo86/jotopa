import { requireSupabase } from '../../lib/supabase'
import { eventFormSchema } from './schemas'
import { utcDateTime } from './dates'

export async function listEvents(signal: AbortSignal) {
  const { data, error } = await requireSupabase().from('events').select('*').order('starts_at').abortSignal(signal)
  if (error) throw error
  return data
}
export async function getEvent(id: string, signal: AbortSignal) {
  const { data, error } = await requireSupabase().from('events').select('*').eq('id', id).abortSignal(signal).single()
  if (error) throw error
  return data
}
export async function getEventRole(id: string) {
  const { data, error } = await requireSupabase().rpc('get_my_event_role', { p_event_id: id })
  if (error) throw error
  return data
}
export async function saveEvent(values: unknown, id?: string) {
  const data = eventFormSchema.parse(values)
  const args = {
    p_title: data.title, p_slug: data.slug, p_type: data.type, p_starts_at: utcDateTime(data.startsAt, data.timezone),
    p_timezone: data.timezone, ...(data.rsvpDeadline ? { p_rsvp_deadline: utcDateTime(data.rsvpDeadline, data.timezone) } : {}),
  }
  if (id) {
    const { error } = await requireSupabase().rpc('update_event', { ...args, p_event_id: id, p_status: data.status })
    if (error) throw error
    return id
  }
  const { data: eventId, error } = await requireSupabase().rpc('create_event', args)
  if (error) throw error
  return eventId
}
export async function deleteEvent(id: string) {
  const { error } = await requireSupabase().rpc('delete_event', { p_event_id: id })
  if (error) throw error
}
