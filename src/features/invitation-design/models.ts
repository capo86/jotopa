import {z} from 'zod'
import {emptyGifts,emptyLocationExtras,giftsSchema,lodgingSchema,locationExtraFields,linkSchema} from './information-models.ts'
import {isAllowedAudioLink} from './links.ts'

export const SECTION_LABELS={welcome:'Bienvenida',countdown:'Cuenta regresiva',schedule:'Horarios y lugares',dress:'Vestimenta',gallery:'Fotografías',details:'Información adicional',gifts:'Regalos y transferencias',lodging:'¿Venís de lejos?',rsvp:'Confirmación',closing:'Despedida'} as const
export const sectionIds=Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[]
const legacySectionSchema=z.object({id:z.enum(['welcome','countdown','schedule','dress','gallery','details','rsvp','closing']),enabled:z.boolean()}).strict()
const sectionSchema=z.object({id:z.enum(['welcome','countdown','schedule','dress','gallery','details','gifts','lodging','rsvp','closing']),enabled:z.boolean()}).strict()
const legacyScheduleSchema=z.object({id:z.uuid(),label:z.string().trim().min(1,'Escribí el nombre de cada momento.').max(80),venue:z.string().max(160),address:z.string().max(300),starts_at:z.iso.datetime({error:'Revisá la fecha y hora de cada momento.'}),latitude:z.number().min(-90).max(90).nullable(),longitude:z.number().min(-180).max(180).nullable()}).strict().refine(value=>(value.latitude===null)===(value.longitude===null),'Completá ambas coordenadas o dejalas vacías.')
export const scheduleSchema=legacyScheduleSchema.safeExtend(locationExtraFields)
const legacyDesignSchema=z.object({
  version:z.literal(1),template:z.enum(['romantic','festive','minimal']),palette:z.enum(['olive','rose','night','sage_rose']),font_pair:z.enum(['classic','modern','editorial']),
  names:z.string().max(160),eyebrow:z.string().max(80),welcome:z.string().max(1600),show_guest_name:z.boolean(),closing:z.string().max(600),dress_code:z.string().max(300),details:z.string().max(1600),
  cover_asset_id:z.uuid().nullable(),cover_focus:z.enum(['center','top','bottom']),
  gallery:z.array(z.object({asset_id:z.uuid(),caption:z.string().max(240)}).strict()).max(8),schedule:z.array(legacyScheduleSchema).max(4),sections:z.array(legacySectionSchema).length(8),
}).strict()
const currentDesignSchema=legacyDesignSchema.extend({version:z.literal(2),cover_quote:z.string().trim().max(180).default(''),cover_quote_title:z.string().trim().max(80).default(''),cover_quote_signature:z.string().trim().max(100).default(''),palette_mix:z.tuple([z.number().int().min(0).max(100),z.number().int().min(0).max(100),z.number().int().min(0).max(100)]).default([34,33,33]),schedule:z.array(scheduleSchema).max(4),sections:z.array(sectionSchema).length(10),gifts:giftsSchema,lodging:z.array(lodgingSchema).max(6),dress_photo_asset_id:z.uuid().nullable(),music_url:linkSchema().refine(isAllowedAudioLink,'Usá un enlace directo a un archivo de audio HTTPS.').default('')}).superRefine((value,context)=>{
  if(value.palette_mix.reduce((sum,part)=>sum+part,0)!==100)context.addIssue({code:'custom',path:['palette_mix'],message:'Los porcentajes de la paleta deben sumar 100 %.'})
  if(new Set(value.sections.map(section=>section.id)).size!==10||new Set(value.gallery.map(photo=>photo.asset_id)).size!==value.gallery.length||new Set(value.schedule.map(item=>item.id)).size!==value.schedule.length||new Set(value.gifts.items.map(item=>item.id)).size!==value.gifts.items.length||new Set(value.lodging.map(item=>item.id)).size!==value.lodging.length)context.addIssue({code:'custom',message:'No repitas secciones, fotografías, actividades, regalos ni hospedajes.'})
  if(/[a-f0-9]{64}/i.test(JSON.stringify(value)))context.addIssue({code:'custom',message:'No incluyas enlaces ni tokens personales dentro del contenido compartido.'})
})
export type InvitationDesign=z.infer<typeof currentDesignSchema>
export const editorDesignSchema=currentDesignSchema
export const designSchema=z.union([currentDesignSchema,legacyDesignSchema.transform((legacy,context)=>{
  const sections:InvitationDesign['sections']=[...legacy.sections]
  const position=sections.findIndex(section=>section.id==='rsvp')
  sections.splice(position<0?sections.length:position,0,{id:'gifts',enabled:false},{id:'lodging',enabled:false})
  const upgraded=currentDesignSchema.safeParse({...legacy,version:2,schedule:legacy.schedule.map(item=>({...item,...emptyLocationExtras()})),sections,gifts:emptyGifts(),lodging:[],dress_photo_asset_id:null})
  if(!upgraded.success){context.addIssue({code:'custom',message:'Revisá el contenido del diseño anterior antes de guardarlo.'});return z.NEVER}
  return upgraded.data
})])
export type ScheduleItem=z.infer<typeof scheduleSchema>
export function designAssetIds(design:InvitationDesign):string[]{
  return [...new Set([design.cover_asset_id,design.dress_photo_asset_id,...design.gallery.map(item=>item.asset_id),...design.schedule.map(item=>item.photo_asset_id),...design.lodging.map(item=>item.photo_asset_id)].filter((id):id is string=>id!==null))]
}
export function emptyDesign(title:string):InvitationDesign {
  return {version:2,template:'romantic',palette:'olive',palette_mix:[34,33,33],cover_quote:'',cover_quote_title:'',cover_quote_signature:'',font_pair:'classic',names:title,eyebrow:'Un encuentro para recordar',welcome:'',show_guest_name:true,closing:'',dress_code:'',details:'',cover_asset_id:null,cover_focus:'center',gallery:[],schedule:[],sections:sectionIds.map(id=>({id,enabled:!['dress','details','gifts','lodging'].includes(id)})),gifts:emptyGifts(),lodging:[],dress_photo_asset_id:null,music_url:''}
}
export const TEMPLATE_OPTIONS=[{id:'romantic',name:'Entre nosotros',style:'Romántica y elegante',description:'Una fotografía envolvente, letras delicadas y detalles de papel.'},{id:'festive',name:'Que sea inolvidable',style:'Moderna y festiva',description:'Un retrato protagonista, ritmo gráfico y una energía especial.'},{id:'minimal',name:'Lo esencial',style:'Minimalista y sofisticada',description:'Composición editorial, aire y fotografías que hablan por sí solas.'}] as const
export const PALETTES={olive:{label:'Olivo y marfil',paper:'#f5f2e9',ink:'#283d32',accent:'#79533d',soft:'#e1e5d8'},rose:{label:'Rosa y vino',paper:'#fbf1ed',ink:'#502d38',accent:'#874256',soft:'#ebd8d3'},night:{label:'Noche y terracota',paper:'#f6f0e4',ink:'#252b43',accent:'#a6392c',soft:'#ead6b4'},sage_rose:{label:'Salvia, rosa y blanco',paper:'#fbfaf8',ink:'#34473a',accent:'#945e67',soft:'#dce3d6'}} as const
export const assetSchema=z.object({id:z.uuid(),event_id:z.uuid(),created_by:z.string().nullable(),status:z.enum(['reserved','ready','deleted']),alt:z.string(),width:z.number().nullable(),height:z.number().nullable(),bytes:z.number().nullable(),created_at:z.string()})
export type DesignAsset=z.infer<typeof assetSchema>
export const imageSchema=z.object({id:z.uuid(),alt:z.string(),width:z.number(),height:z.number(),large:z.string(),small:z.string()})
export type AssetImage=z.infer<typeof imageSchema>
export type AssetImages=Record<string,AssetImage>
export type PresentationEvent={title:string;starts_at:string;timezone:string;rsvp_deadline:string|null}
export function designError(error:unknown):string{
  const key=error instanceof Error?error.message:typeof error==='object'&&error&&'message'in error?error.message:''
  const messages:Record<string,string>={invalid_lodging_phone:'Revisá los teléfonos y WhatsApp de los hospedajes. Sin prefijo se usa +595.',forbidden:'No tenés permiso para cambiar esta invitación.',design_changed:'Hay una versión más reciente. Recargá el borrador antes de guardar.',invalid_design:'Revisá el contenido, los horarios y las secciones. Usá los formatos y límites indicados.',design_incomplete:'Para publicar, completá los nombres y elegí una fotografía de portada.',event_not_active:'Activá el evento desde sus detalles antes de publicar.',asset_unavailable:'Una fotografía ya no está disponible. Revisá la selección.',asset_in_use:'Esta foto está en el borrador o en la versión publicada. Quitala de ambos antes de eliminarla.',invalid_image:'No pudimos usar esta imagen. Elegí un JPG, PNG o WebP válido de hasta 10 MB y 24 megapíxeles.',image_unavailable:'No pudimos cargar las fotografías. Revisá la conexión y volvé a intentar.',upload_limit:'Alcanzaste el límite de 30 cargas por hora. Volvé a intentar más tarde.',asset_limit:'Hay 20 fotos guardadas. Eliminá las que no se usan antes de cargar otra.',invalid_asset:'Escribí una descripción de la fotografía, de hasta 240 caracteres.',unauthorized:'Tu sesión ya no está disponible. Volvé a iniciar sesión.',rate_limited:'Se hicieron varias solicitudes seguidas. Esperá un minuto y volvé a intentar.'}
  return typeof key==='string'&&messages[key]?messages[key]:'No pudimos completar la operación. Revisá la conexión y volvé a intentar.'
}
