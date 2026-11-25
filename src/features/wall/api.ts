import {createClient} from '@supabase/supabase-js'
import {z} from 'zod'
import {supabaseConfig} from '../../lib/env'
import {requireSupabase} from '../../lib/supabase'
import type {Database,Json} from '../../lib/database.types'
import {draftSchema,wallPageSchema,WallMediaError} from './models'
import type {PreparedPhoto,WallDraft,WallImages,WallStatus} from './models'

const anonymous=supabaseConfig?createClient<Database>(supabaseConfig.url,supabaseConfig.publicKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'jotopa-guest-wall'}}):null
export const guestWallTransport=anonymous
async function guestRequest(token:string,request:Json){
  if(!anonymous)throw new Error('invitation_unavailable')
  const {data,error}=await anonymous.rpc('guest_wall',{p_token:token,p_request:request})
  if(error)throw new Error('wall_unavailable')
  if(typeof data==='object'&&data&&!Array.isArray(data)&&data.ok===false)throw new Error(typeof data.code==='string'?data.code:'wall_unavailable')
  return data
}
export async function readWall(token:string,afterId?:string){return wallPageSchema.parse(await guestRequest(token,{action:'list',...(afterId?{after_id:afterId}:{})}))}
export async function beginPost(token:string,draft:WallDraft){return z.object({ok:z.literal(true),post_id:z.uuid(),status:z.string()}).parse(await guestRequest(token,{action:'begin',...draftSchema.parse(draft)}))}
export async function submitPost(token:string,postId:string){await guestRequest(token,{action:'submit',post_id:postId})}
async function invoke(body:FormData|Record<string,unknown>,host=false):Promise<unknown>{
  const sdk=host?requireSupabase():anonymous;if(!sdk)throw new Error('wall_unavailable')
  const {data,error}=await sdk.functions.invoke('wall-media',{body})
  if(error){let code='media_unavailable',retryAfter:number|undefined;if('context'in error&&error.context instanceof Response){try{const detail=z.object({error:z.string().regex(/^[a-z_]{1,64}$/),retry_after:z.number().int().min(1).max(60).optional()}).parse(await error.context.json());code=detail.error;retryAfter=detail.retry_after}catch{/* Never render raw server errors or request data. */}}throw new WallMediaError(code,retryAfter)}
  return data as unknown
}
export const requestWallMedia=invoke
export async function uploadPostPhoto(token:string,postId:string,slot:number,photo:PreparedPhoto){const body=new FormData();body.set('token',token);body.set('post_id',postId);body.set('slot',String(slot));body.set('kind','photo');body.set('large',photo.large,'large.webp');body.set('small',photo.small,'small.webp');await invoke(body)}
export async function uploadPostAudio(token:string,postId:string,audio:Blob){const body=new FormData();body.set('token',token);body.set('post_id',postId);body.set('slot','3');body.set('kind','audio');body.set('file',audio,'audio.wav');await invoke(body)}
export async function cancelPost(token:string,postId:string){await invoke({action:'cancel',token,post_id:postId})}
export async function purgePost(postId:string){await invoke({action:'purge',post_id:postId},true)}
export async function signGuestMedia(token:string,postIds:string[]):Promise<WallImages>{
  if(!postIds.length)return {}
  const result=z.object({media:z.array(z.object({id:z.uuid(),kind:z.enum(['photo','audio']),urls:z.array(z.string())})),expires_at:z.string()}).parse(await invoke({action:'sign',token,post_ids:postIds}))
  return Object.fromEntries(result.media.map(item=>[item.id,{kind:item.kind,urls:item.urls.map(path=>{if(!/^\/storage\/v1\/object\/sign\/wall-(media|audio)\//.test(path)||path.includes('#')||!supabaseConfig)throw new Error('media_unavailable');return new URL(path,supabaseConfig.url).href})}]))
}
export async function fetchModeration(eventId:string,status:WallStatus,page:number,signal:AbortSignal){
  const {data,error,count}=await requireSupabase().from('wall_posts').select('id,event_id,guest_id,author_name,participant_name,body,status,created_at,wall_post_media(id,event_id,kind,state,duration_seconds)',{count:'exact'}).eq('event_id',eventId).eq('status',status).order('created_at',{ascending:false}).order('id').range(page*25,page*25+24).abortSignal(signal)
  if(error)throw new Error('wall_unavailable');return {posts:data,count:count??0}
}
export type ModerationPost=Awaited<ReturnType<typeof fetchModeration>>['posts'][number]
export async function signModeratorMedia(posts:ModerationPost[]):Promise<WallImages>{
  const assets=posts.filter(post=>post.status!=='deleted').flatMap(post=>post.wall_post_media.filter(media=>media.state==='ready').map(media=>({...media,paths:media.kind==='audio'?[`${media.event_id}/${media.id}/audio.wav`]:[`${media.event_id}/${media.id}/large.webp`,`${media.event_id}/${media.id}/small.webp`]})))
  const signed=await Promise.all(assets.map(async media=>{const bucket=media.kind==='audio'?'wall-audio':'wall-media';const result=await requireSupabase().storage.from(bucket).createSignedUrls(media.paths,60);if(result.error||result.data.some(item=>item.error||!item.signedUrl))throw new Error('media_unavailable');return [media.id,{kind:media.kind as 'photo'|'audio',urls:result.data.map(item=>item.signedUrl!)}] as const}))
  return Object.fromEntries(signed)
}
export async function moderatePost(postId:string,status:'approved'|'rejected'|'hidden'){const {error}=await requireSupabase().rpc('moderate_wall_post',{p_post_id:postId,p_status:status});if(error)throw new Error('not_authorized')}
export async function fetchWallSettings(eventId:string,signal:AbortSignal){const {data,error}=await requireSupabase().from('event_wall_settings').select('*').eq('event_id',eventId).abortSignal(signal).maybeSingle();if(error)throw new Error('wall_unavailable');return data}
export async function saveWallSettings(eventId:string,settings:{enabled:boolean;opens_at:string|null;closes_at:string|null;audio_max_seconds:number}){const {error}=await requireSupabase().rpc('configure_event_wall',{p_event_id:eventId,p_enabled:settings.enabled,p_opens_at:settings.opens_at!,p_closes_at:settings.closes_at!,p_audio_max_seconds:settings.audio_max_seconds});if(error)throw new Error('invalid_settings')}
