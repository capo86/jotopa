import {createClient} from 'npm:@supabase/supabase-js@2.119.2'
import type {Database} from '../../../src/lib/database.types.ts'

const url=Deno.env.get('SUPABASE_URL')!
const keys:Record<string,string>=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}')
const publicKey=keys.default??Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const origin=new URL(Deno.env.get('APP_URL')??'http://localhost:5174').origin
const roles=['owner','manager','invitations','content','moderator','checkin','viewer'] as const
type Role=typeof roles[number]
const reply=(status:number,error:string,headers:HeadersInit)=>new Response(JSON.stringify({error}),{status,headers})

Deno.serve(async request=>{
  const requestOrigin=request.headers.get('origin')??''
  const allowed=!requestOrigin||requestOrigin===origin||(origin==='http://localhost:5174'&&['http://localhost:5176','http://127.0.0.1:5174'].includes(requestOrigin))
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(requestOrigin&&allowed?{'Access-Control-Allow-Origin':requestOrigin}:{}),'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}
  if(!allowed)return reply(403,'forbidden',headers)
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return reply(405,'invalid_request',headers)
  const authorization=request.headers.get('authorization')??''
  if(!authorization.startsWith('Bearer '))return reply(401,'unauthorized',headers)
  const client=createClient<Database>(url,publicKey,{auth:{persistSession:false},global:{headers:{Authorization:authorization}}})
  const user=await client.auth.getUser(authorization.slice(7))
  if(user.error||!user.data.user)return reply(401,'unauthorized',headers)
  const profile=await client.from('profiles').select('platform_role').eq('user_id',user.data.user.id).single()
  if(profile.error||profile.data?.platform_role!=='super_admin')return reply(403,'forbidden',headers)
  let data:unknown
  try{
    const reader=request.body?.getReader();if(!reader)return reply(400,'invalid_request',headers)
    const decoder=new TextDecoder();let text='',size=0
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096){await reader.cancel();return reply(413,'invalid_request',headers)}text+=decoder.decode(chunk.value,{stream:true})}
    data=JSON.parse(text+decoder.decode())
  }catch{return reply(400,'invalid_request',headers)}
  if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,'invalid_request',headers)
  const fields=data as Record<string,unknown>,name=fields.fullName,email=fields.email,password=fields.password,eventId=fields.eventId,role=fields.role
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>120||typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=='string'||password.length<10||password.length>72||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)||typeof eventId!=='string'||! /^[a-f0-9-]{36}$/i.test(eventId)||typeof role!=='string'||!roles.includes(role as Role))return reply(400,'invalid_request',headers)
  const event=await client.from('events').select('id').eq('id',eventId).is('deleted_at',null).maybeSingle()
  if(event.error||!event.data)return reply(404,'event_unavailable',headers)
  const reservation=await client.rpc('reserve_admin_user_creation')
  if(reservation.error)return reply(403,'forbidden',headers)
  if(!reservation.data)return reply(429,'rate_limited',headers)
  const admin=createClient<Database>(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const created=await admin.auth.admin.createUser({email:email.trim().toLowerCase(),password,email_confirm:true,user_metadata:{full_name:name.trim()}})
  if(created.error||!created.data.user)return reply(400,'account_unavailable',headers)
  const linked=await client.rpc('admin_add_event_member',{p_event_id:eventId,p_user_id:created.data.user.id,p_role:role as Role})
  if(linked.error){
    const removed=await admin.auth.admin.deleteUser(created.data.user.id)
    return reply(500,removed.error?'account_cleanup_required':'assignment_failed',headers)
  }
  return new Response(JSON.stringify({ok:true}),{status:201,headers})
})
