import {client,sql} from './local-test-helpers.mjs'

export const checked=async promise=>{const result=await promise;if(result.error)throw new Error(`Wall test operation failed (${result.error.code??'network'})`);return result.data}
export const wall=(token,request={action:'list'})=>checked(client().rpc('guest_wall',{p_token:token,p_request:request}))
export const resetWallLimits=guestId=>{if(!/^[a-f0-9-]{36}$/.test(guestId))throw new Error('Invalid fixture');sql(`delete from private.invitation_rate_limits where guest_id='${guestId}';`)}
export async function beginWall(token,body='Un abrazo',extra={}){return wall(token,{action:'begin',body,photo_count:0,audio_count:0,request_id:crypto.randomUUID(),...extra})}
export async function textWall(token,body='Un abrazo',extra={}){const post=await beginWall(token,body,extra);if(post.ok)await wall(token,{action:'submit',post_id:post.post_id});return post}
export function wallPhotoForm(token,postId,images,slot=0){const body=new FormData();body.set('token',token);body.set('post_id',postId);body.set('slot',String(slot));body.set('kind','photo');body.set('large',new Blob([images.large],{type:'image/webp'}),'large.webp');body.set('small',new Blob([images.small],{type:'image/webp'}),'small.webp');return body}
export function wallAudioForm(token,postId,bytes){const body=new FormData();body.set('token',token);body.set('post_id',postId);body.set('slot','3');body.set('kind','audio');body.set('file',new Blob([bytes],{type:'audio/wav'}),'audio.wav');return body}
export async function cleanupWall(sdk,eventId){
  const rows=await checked(sdk.from('wall_posts').select('id').eq('event_id',eventId))
  for(const row of rows){const result=await sdk.functions.invoke('wall-media',{body:{action:'purge',post_id:row.id}});if(result.error)throw new Error('Could not remove private wall fixture media')}
}
