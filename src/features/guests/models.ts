import { z } from 'zod'
import type { Tables } from '../../lib/database.types'

export type Guest = Pick<Tables<'guests'>, 'id' | 'event_id' | 'full_name' | 'email' | 'phone' | 'document_id' | 'group_label' | 'companions_allowed' | 'contact_consent' | 'created_at' | 'updated_at' | 'rsvp_status' | 'rsvp_at' | 'companions_confirmed' | 'opted_out' | 'rsvp_version'> & {party_size:number;attending_count:number;table_id:string|null;table_name:string|null}
export const RSVP_LABELS = {pending:'Sin respuesta',yes:'Sí, asistiré',no:'No asistiré',maybe:'Quizás (histórico)'} as const
export type RosterGuest = Pick<Tables<'guests'>, 'id' | 'event_id' | 'full_name' | 'table_id'> & {table_name:string|null}
export const guestReadSchema = z.object({
  id: z.uuid(), event_id: z.uuid(), full_name: z.string(), email: z.string().nullable(), phone: z.string().nullable(), document_id: z.string().nullable(), group_label: z.string().nullable(), companions_allowed: z.number().int(), contact_consent: z.boolean(), created_at: z.string(), updated_at: z.string(),
  party_size:z.number().int().min(1).max(21),attending_count:z.number().int().min(0).max(21),table_id:z.uuid().nullable(),table_name:z.string().nullable(),rsvp_status:z.enum(['pending','yes','no']),rsvp_at:z.string().nullable(),companions_confirmed:z.number().int(),opted_out:z.boolean(),rsvp_version:z.number().int(),
}) satisfies z.ZodType<Guest>
const rosterSchema = z.object({ id: z.uuid(), event_id: z.uuid(), full_name: z.string(), table_id: z.uuid().nullable(),table_name:z.string().nullable() }) satisfies z.ZodType<RosterGuest>
export const guestListSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('full'), rows: z.array(guestReadSchema), total: z.number().int(), groups: z.array(z.string()) }),
  z.object({ scope: z.literal('roster'), rows: z.array(rosterSchema), total: z.number().int(), groups: z.array(z.string()) }),
])
export const importReportSchema = z.object({
  created: z.number().int(), updated: z.number().int(), rejected: z.number().int(), replayed: z.boolean(),
  rows: z.array(z.object({ row_number: z.number().int(), status: z.enum(['created','updated','rejected']), reason: z.string().optional(), guest_id: z.uuid().optional() })),
})
export type ImportReport = z.infer<typeof importReportSchema>
export type GuestFilters = { search: string; group: string; contact: 'all' | 'with_contact' | 'without_contact'; page: number }

export function guestError(error: unknown): string {
  const message = typeof error === 'object' && error && 'message' in error ? error.message : ''
  const code = typeof error === 'object' && error && 'code' in error ? error.code : ''
  if (code === '42501') return 'No tenés permiso para acceder a estos invitados.'
  const messages: Record<string, string> = {
    invalid_party_size:'El cupo total debe ser un entero entre 1 y 21.', conflicting_capacity:'El cupo y los acompañantes anteriores no coinciden.', guest_duplicate: 'Ya existe un invitado con ese correo, teléfono o documento en este evento.',
    guest_unavailable: 'No encontramos el invitado en este evento. Volvé a cargar la lista.',
    invalid_phone: 'El teléfono no es válido. Revisá el prefijo y la cantidad de dígitos.',
    invalid_email: 'El correo electrónico no es válido.', invalid_document: 'El documento no es válido.',
    invalid_guest: 'Revisá los datos del invitado.', invalid_name: 'Revisá el nombre del invitado.',
    invalid_companions: 'La cantidad de acompañantes debe ser un entero entre 0 y 20.',
    invalid_import: 'El lote no es válido. El máximo es 1.000 filas por importación.',
    import_batch_conflict: 'Este lote ya se usó con otros datos. Volvé a seleccionar el archivo.',
    export_limit: 'La exportación admite hasta 10.000 invitados. Aplicá un filtro para reducirla.',
  }
  return typeof message === 'string' && messages[message] ? messages[message] : 'No pudimos completar la operación. Revisá tu conexión e intentá de nuevo.'
}
export function importReason(reason?: string): string {
  const reasons: Record<string, string> = {
    file_duplicate: 'Repite un identificador en el archivo.', identity_conflict: 'Los identificadores corresponden a personas diferentes. Revisalos manualmente.',
    target_repeated: 'Otra fila intenta actualizar al mismo invitado.', invalid_party_size:'El cupo total debe ser un entero entre 1 y 21.', conflicting_capacity:'El cupo y los acompañantes anteriores no coinciden.', guest_duplicate: 'El identificador ya está en uso.',
    invalid_guest: 'Datos incompletos o inválidos.', invalid_name: 'Nombre inválido.', invalid_email: 'Correo inválido.', invalid_phone: 'Teléfono inválido.',
    invalid_document: 'Documento inválido.', invalid_group: 'Grupo demasiado largo.', invalid_companions: 'Acompañantes inválidos.', invalid_consent: 'Consentimiento inválido.',
  }
  return reason ? reasons[reason] ?? 'No se pudo conciliar la fila.' : ''
}
