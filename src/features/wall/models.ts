import {z} from 'zod'

export class WallMediaError extends Error {
  readonly retryAfter:number|undefined
  constructor(code:string,retryAfter?:number){super(code);this.name='WallMediaError';this.retryAfter=retryAfter}
}

export const draftSchema=z.object({body:z.string().trim().max(2000),participant_name:z.string().trim().min(1).max(80).optional(),photo_count:z.number().int().min(0).max(3),audio_count:z.number().int().min(0).max(1),request_id:z.uuid()}).strict().refine(value=>value.body.length+value.photo_count+value.audio_count>0,'Escribí un mensaje o adjuntá una foto o un audio.')
export type WallDraft=z.infer<typeof draftSchema>
export const mediaSchema=z.object({id:z.uuid(),kind:z.enum(['photo','audio']),duration_seconds:z.number().positive().nullable()})
export const postSchema=z.object({id:z.uuid(),author_name:z.string(),participant_name:z.string().nullable(),body:z.string(),created_at:z.string(),media:z.array(mediaSchema)})
export type WallPost=z.infer<typeof postSchema>
export const wallPageSchema=z.object({ok:z.literal(true),posts:z.array(postSchema),has_more:z.boolean(),can_post:z.boolean(),enabled:z.boolean(),opens_at:z.string(),closes_at:z.string(),audio_max_seconds:z.number().int().min(15).max(120),server_time:z.string()})
export type WallPage=z.infer<typeof wallPageSchema>
export type WallImages=Record<string,{kind:'photo'|'audio';urls:string[]}>
export type PreparedPhoto={id:string;large:Blob;small:Blob;preview:string}
export const WALL_STATUS_LABELS={draft:'En preparación',pending:'Pendiente de aprobación',approved:'Aprobado',rejected:'Rechazado',hidden:'Oculto',deleted:'Eliminado'} as const
export type WallStatus=keyof typeof WALL_STATUS_LABELS
export function wallError(error:unknown):string{
  const code=error instanceof Error?error.message:''
  switch(code){
    case 'rate_limited':return 'Hay muchas solicitudes. Esperá un minuto antes de volver a intentar.'
    case 'post_limit':return 'Podés compartir hasta 3 mensajes cada 10 minutos y 20 por día. Volvé más tarde.'
    case 'wall_closed':return 'Las nuevas dedicatorias no están habilitadas en este momento.'
    case 'invitation_unavailable':return 'Tu invitación no está disponible. Volvé a abrir tu enlace personal.'
    case 'projection_unavailable':return 'El acceso a la pantalla no está disponible. Pedile un enlace nuevo a quien organiza.'
    case 'projection_link_limit':return 'Alcanzaste el límite de 20 enlaces de pantalla por hora. Esperá antes de preparar otro.'
    case 'invalid_image':return 'Elegí una foto JPG, PNG o WebP de hasta 10 MB y al menos 200 × 200 píxeles.'
    case 'audio_too_long':return 'El audio supera la duración permitida. Grabá o elegí uno más corto.'
    case 'invalid_audio':return 'No pudimos procesar ese audio. Probá con otra grabación o un archivo de audio compatible.'
    case 'storage_limit':return 'Este evento alcanzó su límite de archivos. Avisale a quien lo organiza.'
    case 'purge_incomplete':return 'La publicación quedó oculta, pero falta retirar archivos. Reintentá la limpieza.'
    case 'refresh_required':return 'La conversación cambió. Actualizala para continuar.'
    case 'request_conflict':return 'Este intento ya tiene otros datos. Descartalo antes de preparar otro mensaje.'
    default:return 'No pudimos completar la operación. Podés volver a intentar sin duplicar tu publicación.'
  }
}
