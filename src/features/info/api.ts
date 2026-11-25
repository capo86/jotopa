import {z} from 'zod'
import {requireSupabase} from '../../lib/supabase'
import {attendanceSummarySchema,seatingListSchema,seatingReportSchema,tableInputSchema,tableSchema} from './models'
import type {AssignmentRow,SeatingFilters} from './models'

export async function listTables(eventId:string,signal:AbortSignal){const {data,error}=await requireSupabase().rpc('list_event_tables',{p_event_id:eventId}).abortSignal(signal);if(error)throw error;return z.array(tableSchema).parse(data)}
export async function saveTable(eventId:string,name:string,id?:string){const input=tableInputSchema.parse({name});const {error}=await requireSupabase().rpc('save_event_table',{p_event_id:eventId,p_name:input.name,...(id?{p_table_id:id}:{})});if(error)throw error}
export async function deleteTable(eventId:string,id:string){const {error}=await requireSupabase().rpc('delete_event_table',{p_event_id:eventId,p_table_id:id});if(error)throw error}
export async function setTableVisibility(eventId:string,visible:boolean){const {error}=await requireSupabase().rpc('configure_table_visibility',{p_event_id:eventId,p_visible:visible});if(error)throw error}
export async function assignTable(eventId:string,guestId:string,tableId:string){const {error}=await requireSupabase().rpc('assign_guest_table',{p_event_id:eventId,p_guest_id:guestId,...(tableId?{p_table_id:tableId}:{})});if(error)throw error}
export async function listSeatingGuests(eventId:string,filters:SeatingFilters,signal?:AbortSignal){const pending=requireSupabase().rpc('list_seating_guests',{p_event_id:eventId,p_search:filters.search,p_table:filters.table,p_page:filters.page});const {data,error}=await(signal?pending.abortSignal(signal):pending);if(error)throw error;return seatingListSchema.parse(data)}
export async function seatingTemplateGuests(eventId:string,filters:SeatingFilters){
  const first=await listSeatingGuests(eventId,{...filters,page:0});if(first.total>1000)throw new Error('export_limit')
  const rows=[...first.rows]
  for(let page=1;page*25<first.total;page++){const next=await listSeatingGuests(eventId,{...filters,page});rows.push(...next.rows)}
  return rows
}
export async function importAssignments(eventId:string,rows:AssignmentRow[],batchId:string,preview:boolean){const {data,error}=await requireSupabase().rpc('import_table_assignments',{p_event_id:eventId,p_rows:rows.map(row=>({row_number:row.rowNumber,data:row.data??{}})),p_batch_id:batchId,p_preview:preview});if(error)throw error;return seatingReportSchema.parse(data)}
export async function attendanceSummary(eventId:string,signal:AbortSignal){const {data,error}=await requireSupabase().rpc('event_attendance_summary',{p_event_id:eventId}).abortSignal(signal);if(error)throw error;return attendanceSummarySchema.parse(data)}
