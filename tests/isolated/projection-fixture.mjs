import {encodeWav} from '../../src/features/wall/wav.ts'

export const projectionCredential='d'.repeat(64)
const uuid=number=>'f0000000-0000-4000-8000-'+String(number).padStart(12,'0')
export async function projectionFixture(page,{count=0,photos,audioDuration=3}={}){
  const state={revision:0,rows:new Map(),sockets:[],joins:0,maxJoined:0,signatures:0,photoRequests:0,audioRequests:0,syncs:0,revoked:false,failPhotos:false,offset:0}
  const audio=Buffer.from(encodeWav(new Float32Array(16000*audioDuration).map((_,index)=>Math.sin(index*.04)*.03)))
  const future=new Date(Date.now()+4*3600000).toISOString()
  const row=(number,body,media=[])=>({id:uuid(number),author_name:number%2?'Familia González':'María López',participant_name:number===count?'Ana González':null,body,created_at:new Date(Date.now()-86400000+number*1000).toISOString(),media})
  const photo=number=>({id:uuid(10000+number),kind:'photo',duration_seconds:null})
  const voice=number=>({id:uuid(20000+number),kind:'audio',duration_seconds:audioDuration})
  state.put=(post)=>{state.revision++;state.rows.set(post.id,{id:post.id,revision:state.revision,post});return post}
  state.hide=id=>{state.revision++;state.rows.set(id,{id,revision:state.revision,post:null})}
  state.makePost=row;state.photo=photo;state.voice=voice;state.uuid=uuid
  for(let index=1;index<=count;index++)state.put(row(index,index===count?'Una fotografía y nuestra voz para acompañarlos.':'Recuerdo '+String(index).padStart(3,'0')+' · Que nunca falten los abrazos y las razones para encontrarnos.',index%3===0?[photo(index),voice(index)]:index%3===1?[voice(index)]:[]))
  const send=(entry,event,payload)=>{const frame={topic:entry.topic,event,payload,ref:null,join_ref:entry.join};try{entry.socket.send(JSON.stringify(entry.array?[entry.join,null,entry.topic,event,payload]:frame))}catch{/* A fixture socket may already be closed. */}}
  state.notify=()=>state.sockets.filter(socket=>socket.topic).forEach(socket=>send(socket,'broadcast',{event:'wall_changed',type:'broadcast',payload:{}}))
  state.disconnect=()=>{for(const entry of state.sockets)try{entry.topic=null;entry.socket.close({code:1001,reason:'Simulated temporary disconnect'})}catch{/* Closed already. */}}
  await page.routeWebSocket(/\/realtime\/v1\/websocket/,socket=>{
    const entry={socket,topic:null,join:null,array:false};state.sockets.push(entry)
    socket.onMessage(message=>{
      const parsed=JSON.parse(String(message)),frame=Array.isArray(parsed)?{join_ref:parsed[0],ref:parsed[1],topic:parsed[2],event:parsed[3],payload:parsed[4]}:parsed
      entry.array=Array.isArray(parsed)
      if(frame.event==='phx_join'){entry.topic=frame.topic;entry.join=frame.join_ref??frame.ref;state.joins++}
      state.maxJoined=Math.max(state.maxJoined,state.sockets.filter(item=>item.topic).length)
      if(['phx_join','phx_leave','heartbeat'].includes(frame.event)){
        const reply={topic:frame.topic,event:'phx_reply',payload:{status:'ok',response:{postgres_changes:[]}},ref:frame.ref,join_ref:frame.join_ref}
        socket.send(JSON.stringify(entry.array?[frame.join_ref,frame.ref,frame.topic,'phx_reply',reply.payload]:reply))
      }
      if(frame.event==='phx_leave')entry.topic=null
    })
  })
  await page.route('http://127.0.0.1:54321/**',async route=>{
    const request=route.request(),url=new URL(request.url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return}
    if(url.pathname.includes('/storage/v1/object/sign/')){
      if(url.pathname.endsWith('/audio.wav')){state.audioRequests++;await route.fulfill({status:200,headers,contentType:'audio/wav',body:audio});return}
      state.photoRequests++;await route.fulfill({status:state.failPhotos?503:200,headers,contentType:'image/webp',body:state.failPhotos?Buffer.from('unavailable'):photos.small});return
    }
    const input=request.postDataJSON()
    if(url.pathname.endsWith('/rpc/projection_wall')){
      state.syncs++
      if(state.revoked||input.p_access!==projectionCredential){await route.fulfill({json:{ok:false,code:'projection_unavailable'},headers});return}
      const after=input.p_request?.after_revision??0,snapshot=input.p_request?.snapshot_revision??state.revision,rows=[...state.rows.values()].filter(item=>item.revision>after&&item.revision<=snapshot).sort((a,b)=>a.revision-b.revision),changes=rows.slice(0,50),more=rows.length>50,now=new Date(Date.now()+state.offset).toISOString()
      await route.fulfill({headers,json:{ok:true,changes,next_revision:more?changes.at(-1).revision:snapshot,snapshot_revision:snapshot,latest_revision:state.revision,has_more:more,stream_topic:'wall-approved:'+'c'.repeat(64),server_time:now,access_expires_at:future,can_post:false,enabled:true,opens_at:new Date(Date.now()-3600000).toISOString(),closes_at:future,audio_max_seconds:60,event:{title:'Lucía & Mateo',slug:'revision-visual',timezone:'America/Asuncion',starts_at:new Date(Date.now()+864000000).toISOString()}}});return
    }
    if(url.pathname.endsWith('/functions/v1/wall-media')){
      state.signatures++
      if(state.revoked){await route.fulfill({status:403,headers,json:{error:'invitation_unavailable'}});return}
      const media=(input.post_ids??[]).flatMap(id=>state.rows.get(id)?.post?.media??[]).map(item=>({...item,urls:(item.kind==='photo'?['large.webp','small.webp']:['audio.wav']).map(file=>'/storage/v1/object/sign/wall-'+(item.kind==='photo'?'media':'audio')+'/e0000000-0000-4000-8000-000000000001/'+item.id+'/'+file+'?token=ui-fixture-'+state.signatures)}))
      await route.fulfill({headers,json:{media,expires_at:new Date(Date.now()+60000).toISOString()}});return
    }
    await route.fulfill({status:404,headers,json:{error:'No real Supabase request is allowed in this isolated test'}})
  })
  return state
}
