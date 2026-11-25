import {z} from 'zod'
import type {Tables} from '../../lib/database.types'

export const templateSchema=z.object({
  name:z.string().trim().min(2,'Ingresá al menos 2 caracteres.').max(80,'Usá hasta 80 caracteres.'),
  body:z.string().min(1,'Escribí tu mensaje.').max(2000,'Usá hasta 2.000 caracteres.'),
  location_label:z.string().trim().max(240,'Usá hasta 240 caracteres.'),
}).strict().superRefine((data,context)=>{
  const rest=data.body.replace(/\{(nombre|link|fecha|lugar|fecha_limite)\}/g,'')
  if(/[{}]/.test(rest) || !data.body.includes('{link}') || /[a-f0-9]{64}/i.test([data.name,data.body,data.location_label].join(' ')) || [...data.body.matchAll(/\{[^{}]+\}/g)].length>20) context.addIssue({code:'custom',path:['body'],message:'Incluí {link}, usá solo las cinco variables permitidas (hasta 20 veces) y no pegues enlaces personales en los campos de la plantilla.'})
})
export type TemplateValues=z.infer<typeof templateSchema>
export type Template=Pick<Tables<'message_templates'>,'id'|'event_id'|'name'|'body'|'location_label'|'channel'|'created_at'|'updated_at'>
export const templatesSchema=z.array(z.object({id:z.uuid(),event_id:z.uuid(),name:z.string(),body:z.string(),location_label:z.string(),channel:z.enum(['whatsapp','link']),created_at:z.string(),updated_at:z.string()}) satisfies z.ZodType<Template>)
export const messagePayloadSchema=z.object({guest_id:z.uuid(),full_name:z.string(),phone:z.string().nullable(),token:z.string().regex(/^[a-f0-9]{64}$/),body:z.string(),location_label:z.string(),starts_at:z.string(),timezone:z.string(),rsvp_deadline:z.string()})
export type MessagePayload=z.infer<typeof messagePayloadSchema>
export const queueSchema=z.object({available:z.boolean(),total:z.number().int(),rows:z.array(z.object({guest_id:z.uuid(),full_name:z.string(),phone:z.string().nullable(),phone_state:z.enum(['valid','missing','invalid']),queue_state:z.enum(['pending','skipped','failed','done'])}))})
export type QueueGuest=z.infer<typeof queueSchema>['rows'][number]
export const actionSchema=z.object({action:z.string(),request_id:z.uuid(),replayed:z.boolean(),payload:messagePayloadSchema.nullable()})
export type ManualAction='send'|'shared'|'skip'|'failed'|'retry'|'undo'|'copy_message'|'copy_link'
export const trackingSchema=z.array(z.object({guest_id:z.uuid(),status:z.enum(['pending','sent','opened','responded']),open_count:z.number().int(),first_opened_at:z.string().nullable(),last_opened_at:z.string().nullable()}))
export type Tracking=z.infer<typeof trackingSchema>[number]
export const DELIVERY_LABELS={pending:'Pendiente',sent:'Enviada · marca manual',opened:'Abierta · enlace personal',responded:'Respondida'} as const
export const historySchema=z.object({total:z.number().int(),rows:z.array(z.object({id:z.uuid(),type:z.string(),occurred_at:z.string(),actor_id:z.uuid().nullable(),channel:z.enum(['whatsapp','email','link']),meta:z.object({action:z.string().optional(),channel:z.string().optional(),response:z.enum(['yes','no','maybe']).optional(),companions:z.number().optional(),version:z.number().optional(),historical:z.boolean().optional(),source:z.string().optional()})}))})
export function invitationOperationError(error:unknown):string {
  const message=typeof error==='object' && error && 'message'in error ? error.message : ''
  const messages:Record<string,string>={
    forbidden:'No tenés permiso para gestionar estas invitaciones.',contact_not_authorized:'Esta persona no autorizó el contacto o solicitó la baja. No se preparó un envío.',
    sending_closed:'El envío requiere un evento Activo, dentro de su período de acceso y con el plazo RSVP abierto.',invalid_template:'Revisá el mensaje: incluí {link} y usá únicamente las variables permitidas.',
    template_limit:'Podés tener hasta 25 plantillas activas por evento.',template_unavailable:'La plantilla ya no está disponible. Actualizá la lista.',guest_unavailable:'No encontramos a esa persona en este evento.',
    invitation_already_engaged:'Ya hay un envío, apertura o respuesta registrada. Actualizá la cola.',invitation_invalid_phone:'El teléfono no es válido para WhatsApp. Usá la opción de copiar o corregí el teléfono en Invitados.',
    invitation_action_limit:'Alcanzaste el límite de 200 acciones por hora. Intentá más tarde.',invitation_guest_limit:'Esta persona alcanzó el límite de 5 marcas de envío por hora, incluso contando las deshechas.',
    stale_invitation_action:'La marca ya cambió o pasaron los 10 minutos para deshacerla. Actualizá la lista.',invitation_request_conflict:'No pudimos reutilizar esta operación. Actualizá la cola antes de reintentar.',
    message_too_long:'El mensaje personalizado es demasiado largo. Reducí el texto o las repeticiones de variables.',
    clipboard_unavailable:'El navegador no permitió copiar. Revisá los permisos de portapapeles; no se marcó como enviado.',popup_blocked:'El navegador bloqueó la pestaña. Habilitá ventanas emergentes para abrir WhatsApp.',
    popup_closed:'La pestaña se cerró antes de abrir WhatsApp. Revisá el intento y su marca manual.',
  }
  return typeof message==='string' && messages[message] ? messages[message] : 'No pudimos completar la operación. Revisá tu conexión e intentá de nuevo.'
}
