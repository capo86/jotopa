import {z} from 'zod'
import {postSchema} from './models.ts'
import type {WallPost} from './models'

export const syncPageSchema=z.object({ok:z.literal(true),changes:z.array(z.object({revision:z.number().int().nonnegative(),id:z.uuid(),post:postSchema.nullable()})),next_revision:z.number().int().nonnegative(),snapshot_revision:z.number().int().nonnegative(),latest_revision:z.number().int().nonnegative(),has_more:z.boolean(),stream_topic:z.string().regex(/^wall-approved:[a-f0-9]{64}$/),server_time:z.string(),access_expires_at:z.string(),can_post:z.boolean(),enabled:z.boolean(),opens_at:z.string(),closes_at:z.string(),audio_max_seconds:z.number().int().min(15).max(120),event:z.object({title:z.string(),slug:z.string(),timezone:z.string(),starts_at:z.string()}).optional()})
export type SyncPage=z.infer<typeof syncPageSchema>
export type WallAccess={kind:'guest';token:string}|{kind:'projection';slug:string;access:string}
export type WallFeed=Omit<SyncPage,'changes'|'has_more'>&{posts:WallPost[];cursor:number;snapshot:number|null;syncing:boolean;retry_at:number|null}

export function mergeWallChanges(posts:WallPost[],changes:SyncPage['changes']):WallPost[]{
  const byId=new Map(posts.map(post=>[post.id,post]))
  for(const change of changes){if(change.post)byId.set(change.id,change.post);else byId.delete(change.id)}
  return [...byId.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))
}
export function personalEntryPath(value:string,origins:string[]):string|null{
  try{const url=new URL(value.trim(),origins[0]);if(!origins.includes(url.origin)||url.username||url.password||url.search)return null;const match=/^\/i\/([a-f0-9]{64})\/?$/.exec(url.pathname);return match?`/i/${match[1]}#buenos-deseos`:null}catch{return null}
}
export function projectionAccessFromHash(hash:string):string|null{const access=new URLSearchParams(hash.replace(/^#/,'' )).get('access');return access&&/^[a-f0-9]{64}$/.test(access)?access:null}
export function nextScrollPosition(position:number,maximum:number,elapsedSeconds:number,speed:number):number{return Math.min(Math.max(0,maximum),Math.max(0,position)+Math.min(.1,Math.max(0,elapsedSeconds))*Math.min(70,Math.max(10,speed)))}
