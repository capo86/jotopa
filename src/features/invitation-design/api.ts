import {z} from 'zod'
import {createClient} from '@supabase/supabase-js'
import {requireSupabase} from '../../lib/supabase'
import {supabaseConfig} from '../../lib/env'
import type {Json,Database} from '../../lib/database.types'
import {assetSchema,designSchema,imageSchema} from './models'
import type {AssetImages,DesignAsset,InvitationDesign} from './models'

const anonymous=supabaseConfig?createClient<Database>(supabaseConfig.url,supabaseConfig.publicKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'jotopa-invitation-images'}}):null
export async function fetchDesign(eventId:string,signal:AbortSignal){
  const {data,error}=await requireSupabase().from('event_invitation_designs').select('*').eq('event_id',eventId).abortSignal(signal).maybeSingle()
  if(error)throw error
  return data?{...data,draft:designSchema.parse(data.draft),published:data.published?designSchema.parse(data.published):null}:null
}
export async function saveDesign(eventId:string,design:InvitationDesign,revision:number){
  const {data,error}=await requireSupabase().rpc('save_invitation_design',{p_event_id:eventId,p_design:designSchema.parse(design) as Json,p_expected_revision:revision})
  if(error)throw error;return data
}
export async function publishDesign(eventId:string,revision:number){const {error}=await requireSupabase().rpc('publish_invitation_design',{p_event_id:eventId,p_expected_revision:revision});if(error)throw error}
export async function unpublishDesign(eventId:string){const {error}=await requireSupabase().rpc('unpublish_invitation_design',{p_event_id:eventId});if(error)throw error}
export async function fetchAssets(eventId:string,signal:AbortSignal){const {data,error}=await requireSupabase().from('event_invitation_assets').select('*').eq('event_id',eventId).neq('status','deleted').order('created_at').abortSignal(signal);if(error)throw error;return z.array(assetSchema).parse(data)}
export async function hostAssetImages(assets:DesignAsset[]):Promise<AssetImages>{
  const ready=assets.filter(asset=>asset.status==='ready')
  if(!ready.length)return {}
  const paths=ready.flatMap(asset=>[`${asset.event_id}/${asset.id}/large.webp`,`${asset.event_id}/${asset.id}/small.webp`])
  const {data,error}=await requireSupabase().storage.from('event-assets').createSignedUrls(paths,120)
  if(error||data.some(item=>item.error))throw new Error('image_unavailable')
  return Object.fromEntries(ready.map(asset=>[asset.id,{id:asset.id,alt:asset.alt,width:asset.width??1,height:asset.height??1,large:data.find(item=>item.path===`${asset.event_id}/${asset.id}/large.webp`)?.signedUrl??'',small:data.find(item=>item.path===`${asset.event_id}/${asset.id}/small.webp`)?.signedUrl??''}]))
}
async function invoke(body:FormData|Record<string,string>,publicRequest=false){
  const client=publicRequest?anonymous:requireSupabase()
  if(!client)throw new Error('image_unavailable')
  const {data,error}=await client.functions.invoke('invitation-assets',{body})
  if(error){
    let code='image_unavailable'
    if('context'in error&&error.context instanceof Response){try{const parsed=z.object({error:z.string()}).parse(await error.context.json());code=parsed.error}catch{/* safe fallback */}}
    throw new Error(code)
  }
  return data as unknown
}
export async function uploadAsset(eventId:string,alt:string,file:File){
  const {optimizeImage}=await import('./images')
  const images=await optimizeImage(file),form=new FormData()
  form.set('event_id',eventId);form.set('alt',alt);form.set('large',images.large,'large.webp');form.set('small',images.small,'small.webp')
  return z.object({ok:z.literal(true),id:z.uuid()}).parse(await invoke(form)).id
}
export async function removeAsset(eventId:string,id:string){await invoke({action:'remove',event_id:eventId,asset_id:id})}
export async function publicAssetImages(token:string):Promise<AssetImages>{
  const data=z.object({assets:z.array(imageSchema),expires_at:z.string()}).parse(await invoke({action:'sign',token},true))
  if(!supabaseConfig)throw new Error('image_unavailable')
  const base=supabaseConfig.url
  return Object.fromEntries(data.assets.map(asset=>{
    if(![asset.large,asset.small].every(path=>path.startsWith('/storage/v1/object/sign/event-assets/')&&!path.includes('#')))throw new Error('image_unavailable')
    return [asset.id,{...asset,large:new URL(asset.large,base).href,small:new URL(asset.small,base).href}]
  }))
}
export async function fetchPublicInvitation(slug:string){
  const data=z.object({event:z.object({title:z.string(),starts_at:z.string(),timezone:z.string(),rsvp_deadline:z.string().nullable()}),design:designSchema,assets:z.array(imageSchema)}).parse(await invoke({action:'public',slug},true))
  if(!supabaseConfig)throw new Error('image_unavailable')
  const base=supabaseConfig.url
  const images=Object.fromEntries(data.assets.map(asset=>{
    if(![asset.large,asset.small].every(path=>path.startsWith('/storage/v1/object/sign/event-assets/')&&!path.includes('#')))throw new Error('image_unavailable')
    return [asset.id,{...asset,large:new URL(asset.large,base).href,small:new URL(asset.small,base).href}]
  }))
  return {event:data.event,design:{...data.design,show_guest_name:false,sections:data.design.sections.map(section=>section.id==='rsvp'?{...section,enabled:false}:section)},images}
}
