import {z} from 'zod'
import {supabaseConfig} from '../../lib/env'
import {requireSupabase} from '../../lib/supabase'
import type {Json} from '../../lib/database.types'
import {syncPageSchema,mergeWallChanges} from './feed-models'
import type {WallAccess,WallFeed} from './feed-models'
import type {WallImages} from './models'
import {signGuestMedia,guestWallTransport,requestWallMedia} from './api'

export const wallAnonymous=guestWallTransport
const failureSchema=z.object({ok:z.literal(false),code:z.string(),retry_after:z.number().optional()})
export async function syncWallFeed(access:WallAccess,previous:WallFeed|undefined,signal:AbortSignal):Promise<WallFeed>{
  if(!wallAnonymous)throw new Error('invitation_unavailable')
  if(previous?.retry_at&&Date.now()<previous.retry_at)return previous
  let cursor=previous?.cursor??0,snapshot=previous?.snapshot??null,posts=previous?.posts??[],result:WallFeed|undefined=previous
  // Bounded batches keep huge histories responsive and respect the existing
  // committed quotas. Subsequent queries continue from the retained watermark.
  for(let batch=0;batch<8;batch++){
    const response=access.kind==='guest'
      ?await wallAnonymous.rpc('sync_guest_wall',{p_token:access.token,p_after_revision:cursor,...(snapshot!==null?{p_snapshot_revision:snapshot}:{})}).abortSignal(signal)
      :await wallAnonymous.rpc('projection_wall',{p_slug:access.slug,p_access:access.access,p_request:{action:'sync',after_revision:cursor,...(snapshot!==null?{snapshot_revision:snapshot}:{})} as Json}).abortSignal(signal)
    if(response.error)throw new Error('wall_unavailable')
    const failed=failureSchema.safeParse(response.data)
    if(failed.success){
      if(failed.data.code==='rate_limited'&&result)return {...result,retry_at:Date.now()+(failed.data.retry_after??60)*1000}
      if(failed.data.code==='refresh_required'&&cursor!==0){cursor=0;snapshot=null;posts=[];continue}
      throw new Error(failed.data.code)
    }
    const page=syncPageSchema.parse(response.data)
    posts=mergeWallChanges(posts,page.changes);cursor=page.next_revision;snapshot=page.has_more?page.snapshot_revision:null
    result={...page,posts,cursor,snapshot,syncing:page.has_more||page.latest_revision>page.snapshot_revision,retry_at:null}
    if(!page.has_more)return result
  }
  if(!result)throw new Error('wall_unavailable');return result
}

export async function signWallFeedMedia(access:WallAccess,postIds:string[]):Promise<WallImages>{
  if(access.kind==='guest')return signGuestMedia(access.token,postIds)
  if(!wallAnonymous||!supabaseConfig)throw new Error('projection_unavailable')
  const base=supabaseConfig.url
  const data=await requestWallMedia({action:'sign_projection',slug:access.slug,access:access.access,post_ids:postIds})
  const parsed=z.object({media:z.array(z.object({id:z.uuid(),kind:z.enum(['photo','audio']),urls:z.array(z.string())}))}).parse(data)
  return Object.fromEntries(parsed.media.map(item=>[item.id,{kind:item.kind,urls:item.urls.map(path=>{if(!/^\/storage\/v1\/object\/sign\/wall-(media|audio)\//.test(path)||path.includes('#'))throw new Error('media_unavailable');return new URL(path,base).href})}]))
}
export async function projectionStatus(eventId:string){const {data,error}=await requireSupabase().rpc('get_wall_projection_status',{p_event_id:eventId});if(error)throw new Error('not_authorized');return z.object({active:z.boolean(),expires_at:z.string().nullable(),revoked_at:z.string().nullable()}).parse(data)}
export async function issueProjection(eventId:string,hours:number){const {data,error}=await requireSupabase().rpc('issue_wall_projection_access',{p_event_id:eventId,p_expires_at:new Date(Date.now()+hours*3600000).toISOString()});if(error)throw new Error(error.code==='54000'?'projection_link_limit':'projection_unavailable');return z.object({access:z.string().regex(/^[a-f0-9]{64}$/),slug:z.string(),expires_at:z.string()}).parse(data)}
export async function revokeProjection(eventId:string){const {error}=await requireSupabase().rpc('revoke_wall_projection_access',{p_event_id:eventId});if(error)throw new Error('not_authorized')}
export async function approvedWallCount(eventId:string){const {count,error}=await requireSupabase().from('wall_posts').select('id',{count:'exact',head:true}).eq('event_id',eventId).eq('status','approved');if(error)throw new Error('not_authorized');return count??0}
