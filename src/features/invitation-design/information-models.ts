import {z} from 'zod'
import {isAllowedLink} from './links.ts'
import type {LinkKind} from './links.ts'
import type {InvitationDesign} from './models.ts'

export const linkSchema=(kind:LinkKind='external')=>z.string().max(1000).refine(value=>isAllowedLink(value,kind),'Usá un enlace HTTPS válido del servicio indicado, sin credenciales.').transform(value=>value?new URL(value).href:'')
export const locationExtraFields={kind:z.enum(['ceremony','reception','other']),enabled:z.boolean(),description:z.string().max(800),photo_asset_id:z.uuid().nullable(),google_maps_url:linkSchema('maps'),waze_url:linkSchema('waze')}
const phoneSchema=z.string().refine(value=>!value||/^\+[1-9][0-9]{7,14}$/.test(value),'Usá un teléfono internacional válido, por ejemplo +595981123456.')
export const giftItemSchema=z.object({id:z.uuid(),name:z.string().trim().min(1,'Escribí el nombre del regalo.').max(120),description:z.string().max(600),url:linkSchema(),enabled:z.boolean()}).strict()
export const bankingSchema=z.object({enabled:z.boolean(),bank_name:z.string().max(120),holder:z.string().max(160),account:z.string().max(160),alias:z.string().max(120),notes:z.string().max(600)}).strict().refine(value=>!value.enabled||(Boolean(value.holder.trim())&&Boolean(value.account.trim()||value.alias.trim())),'Para publicar transferencias, completá el titular y una cuenta o alias.')
export const giftsSchema=z.object({message:z.string().max(1200),items:z.array(giftItemSchema).max(12),banking:bankingSchema}).strict()
export const lodgingSchema=z.object({id:z.uuid(),name:z.string().trim().min(1,'Escribí el nombre del hospedaje.').max(120),photo_asset_id:z.uuid().nullable(),address:z.string().max(300),description:z.string().max(800),phone:phoneSchema,whatsapp:phoneSchema,booking_url:linkSchema(),google_maps_url:linkSchema('maps'),waze_url:linkSchema('waze'),latitude:z.number().min(-90).max(90).nullable(),longitude:z.number().min(-180).max(180).nullable(),enabled:z.boolean()}).strict().refine(value=>(value.latitude===null)===(value.longitude===null),'Completá ambas coordenadas o dejalas vacías.')
export const emptyBanking=()=>({enabled:false,bank_name:'',holder:'',account:'',alias:'',notes:''})
export const emptyGifts=()=>({message:'',items:[],banking:emptyBanking()})
export const emptyLocationExtras=()=>({kind:'other' as const,enabled:true,description:'',photo_asset_id:null,google_maps_url:'',waze_url:''})
export async function normalizeInformationContacts(design:InvitationDesign):Promise<InvitationDesign>{
  if(!design.lodging.some(item=>item.phone.trim()||item.whatsapp.trim()))return design
  const {normalizePhone}=await import('../guests/index.ts')
  try{return {...design,lodging:design.lodging.map(item=>({...item,phone:normalizePhone(item.phone)??'',whatsapp:normalizePhone(item.whatsapp)??''}))}}
  catch{throw new Error('invalid_lodging_phone')}
}
