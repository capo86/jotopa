import { z } from 'zod'
import type { Tables } from '../../lib/database.types'
import {designSchema} from '../invitation-design/index.ts'

type PublicGuest = Pick<Tables<'guests'>, 'full_name' | 'companions_allowed' | 'companions_confirmed' | 'rsvp_status' | 'rsvp_at' | 'opted_out'> & { version: Tables<'guests'>['rsvp_version'];party_size:number;attending_count:number;table_name:string|null }
type PublicEvent = Pick<Tables<'events'>, 'title' | 'type' | 'starts_at' | 'timezone' | 'rsvp_deadline' | 'session_closes_at'>
const guestSchema = z.object({full_name:z.string(),companions_allowed:z.number().int().min(0).max(20),companions_confirmed:z.number().int().min(0).max(20),party_size:z.number().int().min(1).max(21),attending_count:z.number().int().min(0).max(21),table_name:z.string().nullable(),rsvp_status:z.enum(['pending','yes','no']),rsvp_at:z.string().nullable(),opted_out:z.boolean(),version:z.number().int().min(0)}) satisfies z.ZodType<PublicGuest>
const eventSchema = z.object({title:z.string(),type:z.enum(['wedding','birthday','anniversary','other']),starts_at:z.string(),timezone:z.string(),rsvp_deadline:z.string(),session_closes_at:z.string()}) satisfies z.ZodType<PublicEvent>
export const invitationSchema = z.object({ok:z.literal(true),server_time:z.string(),guest:guestSchema,event:eventSchema,can_respond:z.boolean(),presentation:designSchema.nullable().optional()})
export type Invitation = z.infer<typeof invitationSchema>
export const RSVP_LABELS = {pending:'Sin respuesta',yes:'Sí, asistiré',no:'No asistiré'} as const
export const responseSchema = z.object({
  response:z.enum(['yes','no'],{error:'Elegí Sí, asistiré o No asistiré.'}),
  attending_count:z.number({error:'Ingresá una cantidad válida.'}).int('Ingresá un número entero.').min(0,'La cantidad no puede ser negativa.').max(21,'El máximo es 21 personas.'),
  expected_version:z.number().int().min(0),
}).strict().superRefine((data,context)=>{if((data.response==='yes'&&data.attending_count<1)||(data.response==='no'&&data.attending_count!==0)) context.addIssue({code:'custom',path:['attending_count'],message:'Una respuesta afirmativa requiere al menos una persona; una negativa registra cero asistentes.'})})
export type ResponseValues = z.infer<typeof responseSchema>
export const tokenIsValid = (token:string) => /^[a-f0-9]{64}$/.test(token)

const errorCodes = ['invitation_unavailable','rate_limited','invalid_request','invalid_response','invalid_companions','invalid_attendance','rsvp_closed','response_changed','connection_error'] as const
type ErrorCode = typeof errorCodes[number]
export class InvitationError extends Error {
  readonly code: ErrorCode
  readonly retryAfter: number
  constructor(code:ErrorCode,retryAfter=0) { super(code);this.name='InvitationError';this.code=code;this.retryAfter=retryAfter }
}
export function parseInvitation(value:unknown):Invitation {
  const parsed=invitationSchema.safeParse(value)
  if(parsed.success) return parsed.data
  const failure=z.object({ok:z.literal(false),code:z.enum(errorCodes),retry_after:z.number().int().min(1).max(60).optional()}).safeParse(value)
  if(failure.success) throw new InvitationError(failure.data.code,failure.data.retry_after ?? 0)
  throw new InvitationError('connection_error')
}
export function invitationErrorMessage(error:unknown):string {
  if(!(error instanceof InvitationError)) return 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.'
  const messages:Record<ErrorCode,string>={
    invitation_unavailable:'Este enlace no está disponible. Puede estar fuera de su período de acceso, haber sido reemplazado o ser incorrecto. Consultá con quien te invitó.',
    rate_limited:`Hiciste varias solicitudes seguidas. Esperá ${error.retryAfter || 60} segundos antes de volver a intentar.`,
    invalid_request:'No pudimos procesar la solicitud. Volvé a cargar la invitación.',
    invalid_attendance:'Revisá la cantidad total de personas: no puede superar el cupo de tu invitación.',invalid_response:'Revisá tu respuesta y la cantidad de personas.',
    invalid_companions:'La cantidad de acompañantes supera tu invitación o no corresponde a la respuesta elegida.',
    rsvp_closed:'El plazo para responder terminó. Consultá con quien te invitó si necesitás hacer un cambio.',
    response_changed:'Tu respuesta cambió en otra pestaña. Actualizá la invitación y revisala antes de guardar.',
    connection_error:'No pudimos conectar. Revisá tu conexión e intentá de nuevo.',
  }
  return messages[error.code]
}
