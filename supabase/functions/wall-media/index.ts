import {createClient} from 'npm:@supabase/supabase-js@2.119.2'
import type {Database,Json} from '../../../src/lib/database.types.ts'
import {inspectWebp} from '../invitation-assets/webp.ts'
import {inspectWav} from '../../../src/features/wall/wav.ts'

const url=Deno.env.get('SUPABASE_URL')!
const keys:Record<string,string>=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}')
const publicKey=keys.default??Deno.env.get('SUPABASE_ANON_KEY')!
const serverKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const appOrigin=new URL(Deno.env.get('APP_URL')??'http://localhost:5174').origin
const sdk=(key:string,authorization?:string)=>createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{...(authorization?{headers:{Authorization:authorization}}:{}),fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}})
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)
const token=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const server=sdk(serverKey)

type Manifest={id:string;kind:'photo'|'audio';bucket:string;paths:string[]}
function manifest(value:unknown):Manifest[]{
  if(!Array.isArray(value)||value.length>100)throw new Error('invalid_manifest')
  return value.map(item=>{
    if(!record(item)||!uuid(item.id)||!['photo','audio'].includes(String(item.kind))||!['wall-media','wall-audio'].includes(String(item.bucket))||!Array.isArray(item.paths)||!item.paths.every(path=>typeof path==='string'&&/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/(large\.webp|small\.webp|audio\.wav)$/.test(path)))throw new Error('invalid_manifest')
    return {id:item.id,kind:item.kind as 'photo'|'audio',bucket:String(item.bucket),paths:item.paths as string[]}
  })
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')??''
  const allowed=!origin||origin===appOrigin||(appOrigin==='http://localhost:5174'&&['http://localhost:5176','http://127.0.0.1:5174'].includes(origin))
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Vary':'Origin',...(origin&&allowed?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
  if(!allowed)return reply({error:'origin_not_allowed'},403)
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return reply({error:'invalid_request'},405)
  try{
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let total=0
    if(!reader)return reply({error:'invalid_request'},400)
    while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>3_850_000){await reader.cancel();return reply({error:'invalid_media'},413)}chunks.push(part.value)}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    const contentType=request.headers.get('content-type')??''
    if(contentType.startsWith('application/json')){
      if(total>4096)return reply({error:'invalid_request'},400)
      const body:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!record(body))return reply({error:'invalid_request'},400)
      if(body.action==='sign'||body.action==='sign_projection'){
        const projection=body.action==='sign_projection'
        const valid=projection?Object.keys(body).sort().join(',')==='access,action,post_ids,slug'&&token(body.access)&&typeof body.slug==='string'&&body.slug.length<=80:Object.keys(body).sort().join(',')==='action,post_ids,token'&&token(body.token)
        if(!valid||!Array.isArray(body.post_ids)||body.post_ids.length>25||!body.post_ids.every(uuid))return reply({error:'invalid_request'},400)
        const {data,error}=projection
          ?await sdk(publicKey).rpc('projection_wall',{p_slug:String(body.slug),p_access:String(body.access),p_request:{action:'manifest',post_ids:body.post_ids} as Json})
          :await sdk(publicKey).rpc('guest_wall',{p_token:String(body.token),p_request:{action:'manifest',post_ids:body.post_ids} as Json})
        if(error||!record(data)||data.ok!==true){
          if(record(data)&&data.code==='rate_limited'){
            const retryAfter=typeof data.retry_after==='number'?Math.max(1,Math.min(60,Math.ceil(data.retry_after))):60
            return new Response(JSON.stringify({error:'rate_limited',retry_after:retryAfter}),{status:429,headers:{...headers,'Retry-After':String(retryAfter)}})
          }
          return reply({error:'invitation_unavailable'},403)
        }
        const assets=manifest(data.media),closing=Date.parse(String(data.closes_at));const seconds=Math.min(60,Math.floor((closing-Date.now())/1000)-2)
        if(seconds<1)return reply({error:'invitation_unavailable'},403)
        const signed=await Promise.all(assets.map(async asset=>{
          const result=await server.storage.from(asset.bucket).createSignedUrls(asset.paths,seconds)
          if(result.error||result.data.some(item=>item.error||!item.signedUrl))throw new Error('media_unavailable')
          const paths=result.data.map(item=>{
            const signedUrl=new URL(item.signedUrl!),encoded=signedUrl.searchParams.get('token')?.split('.')[1]
            if(!encoded)throw new Error('media_unavailable')
            const claims:unknown=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')))
            if(!record(claims)||typeof claims.exp!=='number'||claims.exp*1000>closing)throw new Error('media_unavailable')
            return signedUrl.pathname+signedUrl.search
          })
          return {id:asset.id,kind:asset.kind,urls:paths}
        }))
        return reply({media:signed,expires_at:new Date(Date.now()+seconds*1000).toISOString()})
      }
      if(body.action==='purge'||body.action==='cancel'){
        const expected=body.action==='cancel'?'action,post_id,token':'action,post_id'
        if(Object.keys(body).sort().join(',')!==expected||!uuid(body.post_id))return reply({error:'invalid_request'},400)
        let result:unknown
        if(body.action==='cancel'){
          if(!token(body.token))return reply({error:'invitation_unavailable'},403)
          const response=await sdk(publicKey).rpc('guest_wall',{p_token:body.token,p_request:{action:'cancel',post_id:body.post_id}});if(response.error)throw new Error('post_unavailable');result=response.data
        }else{
          const authorization=request.headers.get('authorization')??'';const userClient=sdk(publicKey,authorization)
          const user=await userClient.auth.getUser();if(user.error||!user.data.user)return reply({error:'not_authorized'},401)
          const response=await userClient.rpc('delete_wall_post',{p_post_id:body.post_id});if(response.error)return reply({error:'not_authorized'},403);result=response.data
        }
        if(!record(result)||result.ok!==true)return reply({error:'post_unavailable'},403)
        const items=manifest(result.media)
        await Promise.all(items.map(async item=>{const removed=await server.storage.from(item.bucket).remove(item.paths);if(removed.error)throw new Error('purge_incomplete')}))
        const complete=await server.rpc('finish_wall_purge',{p_post_id:body.post_id});if(complete.error)throw new Error('purge_incomplete')
        return reply({ok:true})
      }
      return reply({error:'invalid_request'},400)
    }
    if(!contentType.startsWith('multipart/form-data'))return reply({error:'invalid_request'},400)
    const form=await new Request(request.url,{method:'POST',headers:{'content-type':contentType},body:bytes}).formData()
    const kind=form.get('kind'),personalToken=form.get('token'),postId=form.get('post_id'),slot=form.get('slot')
    if(!token(personalToken)||!uuid(postId)||typeof slot!=='string'||!/^[0-3]$/.test(slot))return reply({error:'invalid_request'},400)
    const expected=kind==='photo'?'kind,large,post_id,slot,small,token':'file,kind,post_id,slot,token'
    if([...form.keys()].sort().join(',')!==expected)return reply({error:'invalid_request'},400)
    const access=await sdk(publicKey).rpc('check_wall_upload',{p_token:personalToken,p_post_id:postId})
    if(access.error||!record(access.data)||access.data.ok!==true)return reply({error:record(access.data)?String(access.data.code):'post_unavailable'},403)
    const files:Uint8Array[]=[];let duration:number|undefined
    if(kind==='photo'){
      for(const [name,max] of [['large',1920],['small',720]] as const){const file=form.get(name);if(!(file instanceof File)||file.type!=='image/webp'||file.size>1000000)throw new Error('invalid_image');const fileBytes=new Uint8Array(await file.arrayBuffer());inspectWebp(fileBytes,max);files.push(fileBytes)}
    }else if(kind==='audio'){
      const file=form.get('file');if(!(file instanceof File)||file.type!=='audio/wav')throw new Error('invalid_audio')
      const fileBytes=new Uint8Array(await file.arrayBuffer());duration=inspectWav(fileBytes);files.push(fileBytes)
    }else return reply({error:'invalid_media'},400)
    const combined=new Uint8Array(files.reduce((size,file)=>size+file.length,0));offset=0;for(const file of files){combined.set(file,offset);offset+=file.length}
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',combined)),byte=>byte.toString(16).padStart(2,'0')).join('')
    const {data,error}=await sdk(publicKey).rpc('guest_wall',{p_token:personalToken,p_request:{action:'reserve',post_id:postId,slot:Number(slot),kind,fingerprint,byte_count:combined.length,...(duration!==undefined?{duration_seconds:duration}:{})}})
    if(error||!record(data)||data.ok!==true)return reply({error:record(data)?String(data.code):'post_unavailable'},403)
    const asset=manifest([data.media])[0]!
    if(data.ready===true)return reply({ok:true,id:asset.id})
    try{
      // Same reserved fingerprint means a retry can safely replace partial bytes.
      await Promise.all(asset.paths.map(async(path,index)=>{const uploaded=await server.storage.from(asset.bucket).upload(path,files[index]!,{contentType:kind==='photo'?'image/webp':'audio/wav',upsert:true,cacheControl:'0'});if(uploaded.error)throw new Error('upload_failed')}))
      const complete=await server.rpc('complete_wall_media',{p_media_id:asset.id});if(complete.error)throw new Error('post_unavailable')
    }catch{
      // A simultaneous identical retry may already have attested these paths.
      // Never delete its successful bytes as compensation. Reserved files stay
      // private and can be retried or purged from moderation, including deleted
      // posts whose earlier upload was still in flight during the first purge.
      return reply({error:'upload_failed'},503)
    }
    return reply({ok:true,id:asset.id})
  }catch(error){
    const code=error instanceof Error&&['invalid_audio','invalid_image','purge_incomplete'].includes(error.message)?error.message:'media_unavailable'
    return reply({error:code},400)
  }
})
