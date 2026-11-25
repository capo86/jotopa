import {z} from 'zod'

export const tableInputSchema=z.object({name:z.string().trim().min(1,'Escribí un nombre o número de mesa.').max(80,'Usá hasta 80 caracteres.')})
export const tableSchema=z.object({id:z.uuid(),name:z.string(),invitations:z.number().int(),authorized_people:z.number().int(),confirmed_people:z.number().int()})
export type EventTable=z.infer<typeof tableSchema>
export const seatingGuestSchema=z.object({id:z.uuid(),full_name:z.string(),party_size:z.number().int(),attending_count:z.number().int(),rsvp_status:z.enum(['pending','yes','no']),table_id:z.uuid().nullable(),table_name:z.string().nullable()})
export const seatingListSchema=z.object({total:z.number().int(),rows:z.array(seatingGuestSchema)})
export type SeatingGuest=z.infer<typeof seatingGuestSchema>
export const seatingReportSchema=z.object({assigned:z.number().int(),rejected:z.number().int(),replayed:z.boolean(),rows:z.array(z.object({row_number:z.number().int(),status:z.enum(['assigned','rejected']),reason:z.string().nullable()}))})
export const attendanceSummarySchema=z.object({invitations:z.number().int(),authorized_people:z.number().int(),confirmed_invitations:z.number().int(),confirmed_people:z.number().int(),declined_invitations:z.number().int(),pending_invitations:z.number().int(),assigned_people:z.number().int(),total_tables:z.number().int(),available_tables:z.number().int()})
export type SeatingFilters={search:string;table:string;page:number}
export type AssignmentRow={rowNumber:number;cells:string[];data:{guest_id:string|null;phone:string|null;email:string|null;document_id:string|null;table_name:string}|null;errors:string[]}
export function seatingError(error:unknown):string{
  const message=error&&typeof error==='object'&&'message'in error?error.message:''
  const code=error&&typeof error==='object'&&'code'in error?error.code:''
  if(code==='42501')return 'No tenés permiso para realizar esta acción en el evento.'
  const messages:Record<string,string>={invalid_table:'Revisá el nombre de la mesa.',table_duplicate:'Ya existe una mesa con ese nombre o número.',table_unavailable:'La mesa no está disponible en este evento.',table_in_use:'La mesa tiene invitaciones asignadas. Cambiá o quitá esas asignaciones antes de eliminarla.',guest_unavailable:'No encontramos la invitación en este evento.',table_limit:'El máximo es 500 mesas por evento.',invalid_import:'Revisá la planilla. Se admiten hasta 1.000 filas por lote.',import_batch_conflict:'El lote ya se usó con otros datos. Volvé a seleccionar el archivo.',export_limit:'La plantilla admite hasta 1.000 invitaciones. Aplicá un filtro antes de descargarla.'}
  return typeof message==='string'&&messages[message]?messages[message]:'No pudimos completar la operación. Revisá tu conexión e intentá de nuevo.'
}
export function assignmentReason(reason:string|null|undefined){
  const labels:Record<string,string>={invalid_assignment:'Completá un identificador válido y una mesa de hasta 80 caracteres.',guest_unavailable:'No encontramos una invitación con ese identificador en este evento.',table_unavailable:'La mesa no existe en este evento. Creala antes de importar.',identity_conflict:'Los identificadores corresponden a invitaciones diferentes.',target_repeated:'Otra fila intenta asignar la misma invitación.',contact_not_authorized:'Tu rol solo puede importar mediante el ID de invitación; quitá los contactos.',invalid_phone:'Teléfono inválido.',invalid_email:'Correo inválido.',invalid_document:'Documento inválido.'}
  return reason?labels[reason]??'Fila inválida. Revisá sus identificadores.':''
}
