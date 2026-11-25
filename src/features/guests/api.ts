import { z } from 'zod'
import { requireSupabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { guestFormSchema } from './validation'
import type { ImportRow } from './validation'
import { guestListSchema, guestReadSchema, importReportSchema } from './models'
import type { GuestFilters } from './models'

const fields = 'id,event_id,full_name,email,phone,document_id,group_label,companions_allowed,contact_consent,created_at,updated_at,rsvp_status,rsvp_at,companions_confirmed,opted_out,rsvp_version,party_size,attending_count,table_id' as const
export async function listGuests(eventId: string, filters: GuestFilters, signal: AbortSignal) {
  const { data, error } = await requireSupabase().rpc('list_guests', { p_event_id: eventId, p_search: filters.search, p_group: filters.group, p_contact: filters.contact, p_page: filters.page, p_page_size: 25 }).abortSignal(signal)
  if (error) throw error
  return guestListSchema.parse(data)
}
export async function saveGuest(eventId: string, values: unknown, guestId?: string) {
  const payload = guestFormSchema.parse(values)
  const { data, error } = await requireSupabase().rpc('save_guest', { p_event_id: eventId, p_data: payload, ...(guestId ? { p_guest_id: guestId } : {}) })
  if (error) throw error
  return data
}
export async function getGuest(eventId: string, guestId: string, signal: AbortSignal) {
  const { data, error } = await requireSupabase().from('guests').select(fields).eq('event_id', eventId).eq('id', guestId).abortSignal(signal).single()
  if (error) throw error
  return data
}
export async function deleteGuest(eventId: string, guestId: string) {
  const { error } = await requireSupabase().rpc('delete_guest', { p_event_id: eventId, p_guest_id: guestId })
  if (error) throw error
}
export async function importGuests(eventId: string, rows: ImportRow[], batchId: string, preview: boolean) {
  const payload: Json = rows.map(row => ({ row_number: row.rowNumber, data: row.data ?? {} }))
  const { data, error } = await requireSupabase().rpc('import_guests', { p_event_id: eventId, p_rows: payload, p_batch_id: batchId, p_preview: preview })
  if (error) throw error
  return importReportSchema.parse(data)
}
export async function exportGuests(eventId: string, filters: GuestFilters) {
  const { data, error } = await requireSupabase().rpc('export_guests', { p_event_id: eventId, p_search: filters.search, p_group: filters.group, p_contact: filters.contact })
  if (error) throw error
  return z.array(guestReadSchema).parse(data)
}
