import {createClient} from 'npm:@supabase/supabase-js@2.119.2'
import {inspectWebp} from './webp.ts'
import type {Database} from '../../../src/lib/database.types.ts'

const url=Deno.env.get('SUPABASE_URL')!
const keys:Record<string,string>=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}')
const publicKey=keys.default??Deno.env.get('SUPABASE_ANON_KEY')!
const serverKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const appOrigin=new URL(Deno.env.get('APP_URL')??'http://localhost:5174').origin
const sdk=(key:string,authorization?:string)=>createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{...(authorization?{headers:{Authorization:authorization}}:{}),fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}})
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value)
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)

Deno.serve(async request=>{
  const origin=request.headers.get('origin')??''
  const allowed=origin===''||origin===appOrigin||(appOrigin==='http://localhost:5174'&&['http://localhost:5176','http://127.0.0.1:5174'].includes(origin))
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Vary':'Origin',...(origin&&allowed?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
  if(!allowed)return reply({error:'origin_not_allowed'},403)
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return reply({error:'invalid_request'},405)
  try{
    const maximum=2_100_000
    if(Number(request.headers.get('content-length')??0)>maximum)return reply({error:'invalid_image'},413)
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[]
    let total=0
    if(!reader)return reply({error:'invalid_request'},400)
    while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>maximum){await reader.cancel();return reply({error:'invalid_image'},413)}chunks.push(part.value)}
    const bytes=new Uint8Array(total);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length}
    const contentType=request.headers.get('content-type')??''
    if(contentType.startsWith('application/json')){
      if(total>1024)return reply({error:'invalid_request'},400)
      const body:unknown=JSON.parse(new TextDecoder().decode(bytes))
      if(!record(body))return reply({error:'invalid_request'},400)
      if(body.action==='sign'){
        if(Object.keys(body).sort().join(',')!=='action,token'||typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return reply({error:'invitation_unavailable'},400)
        const {data,error}=await sdk(publicKey).rpc('invitation_asset_manifest',{p_token:body.token})
        if(error||!record(data)||data.ok!==true)return reply({error:record(data)&&data.code==='rate_limited'?'rate_limited':'invitation_unavailable'},record(data)&&data.code==='rate_limited'?429:403)
        const closing=Date.parse(String(data.closes_at))
        const seconds=Math.min(60,Math.floor((closing-Date.now())/1000)-2)
        if(seconds<1||!Array.isArray(data.assets))return reply({error:'invitation_unavailable'},403)
        const assets:Record<string,unknown>[]=[]
        for(const item of data.assets){if(record(item))assets.push(item)}
        const paths=assets.flatMap(asset=>[String(asset.large_path),String(asset.small_path)])
        if(!paths.length)return reply({assets:[],expires_at:new Date(Date.now()+seconds*1000).toISOString()})
        const signed=await sdk(serverKey).storage.from('event-assets').createSignedUrls(paths,seconds)
        if(signed.error||signed.data.some(item=>item.error||!item.signedUrl))return reply({error:'image_unavailable'},503)
        // Signing occurs after the SQL check. Verify the actual Storage expiry
        // before returning a URL, so network delay cannot extend the window.
        for(const item of signed.data){
          if(!item.signedUrl)return reply({error:'image_unavailable'},503)
          const credential=new URL(item.signedUrl).searchParams.get('token')
          const encoded=credential?.split('.')[1]
          if(!encoded)return reply({error:'image_unavailable'},503)
          const claims:unknown=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')))
          if(!record(claims)||typeof claims.exp!=='number'||claims.exp*1000>closing)return reply({error:'invitation_unavailable'},403)
        }
        const relative=(path:string)=>{const item=signed.data.find(value=>value.path===path);if(!item?.signedUrl)throw new Error('image_unavailable');const parsed=new URL(item.signedUrl);return parsed.pathname+parsed.search}
        return reply({assets:assets.map(asset=>({id:asset.id,alt:asset.alt,width:asset.width,height:asset.height,large:relative(String(asset.large_path)),small:relative(String(asset.small_path))})),expires_at:new Date(Date.now()+seconds*1000).toISOString()})
      }
      if(body.action==='remove'&&Object.keys(body).sort().join(',')==='action,asset_id,event_id'&&uuid(body.event_id)&&uuid(body.asset_id)){
        const authorization=request.headers.get('authorization')??''
        const user=sdk(publicKey,authorization),auth=await user.auth.getUser()
        if(auth.error||!auth.data.user)return reply({error:'unauthorized'},401)
        const removed=await user.rpc('remove_invitation_asset',{p_event_id:body.event_id,p_asset_id:body.asset_id})
        if(removed.error)return reply({error:removed.error.message==='asset_in_use'?'asset_in_use':'forbidden'},403)
        const base=`${body.event_id}/${body.asset_id}`
        const result=await sdk(serverKey).storage.from('event-assets').remove([`${base}/large.webp`,`${base}/small.webp`])
        return result.error?reply({error:'image_unavailable'},503):reply({ok:true})
      }
      return reply({error:'invalid_request'},400)
    }
    if(!contentType.startsWith('multipart/form-data'))return reply({error:'invalid_request'},400)
    const user=sdk(publicKey,request.headers.get('authorization')??''),auth=await user.auth.getUser()
    if(auth.error||!auth.data.user)return reply({error:'unauthorized'},401)
    const form=await new Response(bytes,{headers:{'content-type':contentType}}).formData()
    if([...form.keys()].sort().join(',')!=='alt,event_id,large,small')return reply({error:'invalid_request'},400)
    const eventId=form.get('event_id'),alt=form.get('alt'),large=form.get('large'),small=form.get('small')
    if(!uuid(eventId)||typeof alt!=='string'||!(large instanceof File)||!(small instanceof File)||large.type!=='image/webp'||small.type!=='image/webp'||large.size+small.size>2_000_000)return reply({error:'invalid_image'},400)
    const [largeBytes,smallBytes]=await Promise.all([large.arrayBuffer(),small.arrayBuffer()])
    const dimensions=inspectWebp(new Uint8Array(largeBytes),1920),thumbnail=inspectWebp(new Uint8Array(smallBytes),720)
    if(Math.abs(dimensions.width/dimensions.height-thumbnail.width/thumbnail.height)>.02)return reply({error:'invalid_image'},400)
    const reservation=await user.rpc('reserve_invitation_asset',{p_event_id:eventId,p_alt:alt})
    if(reservation.error)return reply({error:['upload_limit','asset_limit','invalid_asset'].includes(reservation.error.message)?reservation.error.message:'forbidden'},403)
    const id=reservation.data,base=`${eventId}/${id}`,storage=sdk(serverKey)
    try{
      const results=await Promise.all([storage.storage.from('event-assets').upload(`${base}/large.webp`,largeBytes,{contentType:'image/webp',upsert:false,cacheControl:'60'}),storage.storage.from('event-assets').upload(`${base}/small.webp`,smallBytes,{contentType:'image/webp',upsert:false,cacheControl:'60'})])
      if(results.some(result=>result.error))throw new Error('image_unavailable')
      const complete=await storage.rpc('complete_invitation_asset',{p_asset_id:id,p_width:dimensions.width,p_height:dimensions.height,p_bytes:large.size+small.size})
      if(complete.error)throw new Error('image_unavailable')
      return reply({ok:true,id})
    }catch{
      await storage.storage.from('event-assets').remove([`${base}/large.webp`,`${base}/small.webp`])
      await user.rpc('remove_invitation_asset',{p_event_id:eventId,p_asset_id:id})
      return reply({error:'image_unavailable'},503)
    }
  }catch(error){return error instanceof Error&&error.message==='invalid_image'?reply({error:'invalid_image'},400):reply({error:'image_unavailable'},503)}
})
