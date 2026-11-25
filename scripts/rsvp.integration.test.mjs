import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {test} from 'node:test'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {client,sql,removeTestUsers,apiUrl,publicKey} from './local-test-helpers.mjs'

const checked=async promise=>{const r=await promise;if(r.error) throw new Error(`Local RSVP operation failed (${r.error.code ?? 'network'})`);return r.data}
const failCode=(r,code)=>{assert.equal(r.ok,false);assert.equal(r.code,code);assert.equal('guest'in r,false);assert.equal('event'in r,false)}
test('real personal invitations: temporal access, RSVP, isolation, concurrency and committed limits',async t=>{
  const users=[],events=[],anonymous=client(),tokens=[],guestIds=[]
  let eventId,otherId
  try {
    for(const role of ['owner','manager','invitations','content','moderator','checkin','viewer','outsider']) {
      const sdk=client(), data=await checked(sdk.auth.signUp({email:`jotopa-rsvp-${randomUUID()}@example.test`,password:`RsvpTest42-${randomUUID()}`,options:{data:{full_name:`RSVP test ${role}`}}}))
      users.push({sdk,id:data.user.id,role})
    }
    const owner=users[0].sdk,args=title=>({p_title:title,p_slug:`rsvp-${randomUUID()}`,p_type:'other',p_starts_at:new Date(Date.now()+86400000*10).toISOString()})
    eventId=await checked(owner.rpc('create_event',args('RSVP fixture')));events.push(eventId)
    otherId=await checked(users.at(-1).sdk.rpc('create_event',args('Private other event')));events.push(otherId)
    sql(`insert into public.event_members(event_id,user_id,role) values ${users.slice(1,-1).map(u=>`('${eventId}','${u.id}','${u.role}')`).join(',')};update public.events set status='active' where id in ('${eventId}','${otherId}');`)
    for(const [sdk,ev,name] of [[owner,eventId,'Persona principal'],[owner,eventId,'Otra persona'],[users.at(-1).sdk,otherId,'Persona de otro evento']]) {
      const id=await checked(sdk.rpc('save_guest',{p_event_id:ev,p_data:{full_name:name,email:`person-${randomUUID()}@example.test`,phone:guestIds.length===1?null:'+595981123456',companions_allowed:2}}))
      guestIds.push(id);tokens.push(await checked(sdk.rpc('get_guest_invitation_token',{p_event_id:ev,p_guest_id:id})))
    }
    const call=(index=0,request={action:'read'})=>checked(anonymous.rpc('guest_invitation',{p_token:tokens[index],p_request:request}))
    const reset=()=>sql(`delete from private.invitation_rate_limits where guest_id='${guestIds[0]}';`)
    const respond=(response,companions=0,version=0)=>call(0,{action:'respond',response,companions,expected_version:version})
    await t.test('256-bit unique tokens, stable retrieval and all seven management permissions',async()=>{
      assert.equal(tokens.every(token=>/^[a-f0-9]{64}$/.test(token)),true);assert.equal(new Set(tokens).size,3)
      for(const u of users) {
        const r=await u.sdk.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestIds[0]})
        if(['owner','manager','invitations'].includes(u.role)) assert.equal(r.data===tokens[0],true)
        else assert.equal(r.error?.code,'42501')
        assert.ok((await u.sdk.from('guests').select('invite_token')).error)
        const config=await u.sdk.rpc('configure_event_access',{p_event_id:eventId,p_opens_at:new Date(Date.now()-3600000).toISOString(),p_closes_at:new Date(Date.now()+86400000*2).toISOString()})
        assert.equal(Boolean(config.error),!['owner','manager'].includes(u.role))
      }
      assert.ok((await anonymous.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestIds[0]})).error)
      assert.ok((await owner.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestIds[2]})).error)
      assert.ok((await users[2].sdk.rpc('configure_event_access',{p_event_id:eventId,p_opens_at:new Date().toISOString(),p_closes_at:new Date(Date.now()+100000).toISOString()})).error)
    })
    await t.test('anonymous token access returns exactly one minimal event/guest projection',async()=>{
      const response=await fetch(`${apiUrl}/rest/v1/rpc/guest_invitation`,{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({p_token:tokens[0]})})
      assert.ok(response.headers.get('cache-control')?.includes('no-store'));assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal((await response.json()).ok,true)
      for(let i=0;i<3;i++) {
        const data=await call(i);assert.equal(data.ok,true)
        assert.equal(data.guest.full_name,['Persona principal','Otra persona','Persona de otro evento'][i])
        assert.deepEqual(Object.keys(data.guest).sort(),['attending_count','companions_allowed','companions_confirmed','full_name','opted_out','party_size','rsvp_at','rsvp_status','table_name','version'])
        const serialized=JSON.stringify(data)
        for(const key of ['email','phone','document_id','invite_token','created_by','guest_id','event_id']) assert.equal(serialized.includes(`"${key}"`),false)
        assert.equal(serialized.includes(tokens[i]),false)
      }
      assert.ok((await anonymous.from('guests').select('full_name')).error)
      assert.ok((await anonymous.from('events').select('title')).error)
      assert.ok((await anonymous.rpc('list_guests',{p_event_id:eventId})).error)
      failCode(await call(0,{action:'read',guest_id:guestIds[1]}),'invalid_request')
      failCode(await call(0,{action:'respond',response:'yes',companions:0,expected_version:0,event_id:otherId}),'invalid_request')
    })
    await t.test('invalid and manipulated tokens reveal no data, and GET is not a public read bypass',async()=>{
      for(const token of ['',null,'bad',randomBytes(32).toString('hex'),tokens[0].slice(0,-1)+(tokens[0].endsWith('a')?'b':'a')]) failCode(await checked(anonymous.rpc('guest_invitation',{p_token:token,p_request:{action:'read'}})),'invitation_unavailable')
      const response=await fetch(`${apiUrl}/rest/v1/rpc/guest_invitation?p_token=invalid`,{headers:{apikey:publicKey}})
      const data=await response.json(); assert.equal(data.ok,false);assert.equal('guest'in data,false)
    })
    await t.test('opening/closing windows and active/deleted states are enforced on reads and writes',async()=>{
      const unavailable=async()=>{failCode(await call(),'invitation_unavailable');failCode(await respond('yes'),'invitation_unavailable');failCode(await call(0,{action:'opt_out'}),'invitation_unavailable')}
      sql(`update public.events set session_opens_at=now()+interval '1 hour' where id='${eventId}';`);await unavailable()
      sql(`update public.events set session_opens_at=now()-interval '2 hours',session_closes_at=now()-interval '1 hour' where id='${eventId}';`);await unavailable()
      sql(`update public.events set session_closes_at=now()+interval '2 days',status='draft' where id='${eventId}';`);await unavailable()
      sql(`update public.events set status='closed' where id='${eventId}';`);await unavailable()
      sql(`update public.events set status='active',deleted_at=now() where id='${eventId}';`);await unavailable()
      sql(`update public.events set deleted_at=null where id='${eventId}';`)
      assert.equal((await call()).ok,true)
    })
    await t.test('Binary RSVP, rejection of Maybe, response changes and exact retries preserve UTC and guest isolation',async()=>{
      reset()
      const first=await respond('yes',2);assert.equal(first.guest.rsvp_status,'yes');assert.equal(first.guest.companions_confirmed,2);assert.equal(first.guest.version,1)
      assert.ok(Math.abs(Date.parse(first.guest.rsvp_at)-Date.now())<10000)
      const retry=await respond('yes',2,0);assert.equal(retry.guest.rsvp_at,first.guest.rsvp_at);assert.equal(retry.guest.version,1)
      const no=await respond('no',0,1);assert.equal(no.guest.rsvp_status,'no');assert.equal(no.guest.companions_confirmed,0)
      failCode(await respond('maybe',0,2),'invalid_response');reset();const resumed=await respond('yes',1,2);assert.equal(resumed.guest.rsvp_status,'yes')
      assert.equal((await call(1)).guest.rsvp_status,'pending');assert.equal((await call(2)).guest.rsvp_status,'pending')
      assert.equal((await checked(owner.rpc('list_guests',{p_event_id:eventId}))).rows.find(g=>g.id===guestIds[0]).rsvp_status,'yes')
    })
    await t.test('server validates companions, schema and immutable fields independently of React',async()=>{
      reset()
      failCode(await respond('yes',3,3),'invalid_companions');failCode(await respond('no',1,3),'invalid_companions')
      failCode(await respond('maybe',1,3),'invalid_response');failCode(await respond('yes',-1,3),'invalid_response')
      failCode(await respond('yes',1.5,3),'invalid_response');failCode(await respond('pending',0,3),'invalid_response')
      reset()
      failCode(await call(0,{action:'respond',response:'yes',companions:0,expected_version:3,opted_out:false}),'invalid_request')
      for(const p_request of [[],null,{action:'other'},{action:'read',x:'x'.repeat(2000)}]) failCode(await call(0,p_request),'invalid_request')
      assert.ok((await owner.rpc('save_guest',{p_event_id:eventId,p_guest_id:guestIds[0],p_data:{full_name:'Bad manual RSVP',rsvp_status:'yes'}})).error)
    })
    await t.test('deadline blocks RSVP while leaving read and irreversible opt-out available',async()=>{
      reset();sql(`update public.events set rsvp_deadline=now()-interval '1 second' where id='${eventId}';`)
      const data=await call();assert.equal(data.can_respond,false)
      failCode(await respond('yes',1,3),'rsvp_closed')
      const opted=await call(0,{action:'opt_out'});assert.equal(opted.guest.opted_out,true)
      failCode(await call(0,{action:'opt_out',opted_out:false}),'invalid_request')
      await checked(owner.rpc('save_guest',{p_event_id:eventId,p_guest_id:guestIds[0],p_data:{full_name:'Persona principal',email:null,phone:null,companions_allowed:2,contact_consent:false}}))
      assert.equal((await call()).guest.opted_out,true)
      sql(`update public.events set rsvp_deadline=starts_at where id='${eventId}';`)
    })
    await t.test('concurrent conflicting replies allow exactly one update and limits survive parallel failures',async()=>{
      reset();const previous=(await call()).guest.version
      const initial=await respond('yes',0,previous);assert.equal(initial.ok,true)
      reset();const version=initial.guest.version
      const results=await Promise.all([respond('yes',1,version),respond('no',0,version)])
      assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.code==='response_changed').length,1)
      reset()
      const badRequests=await Promise.all(Array.from({length:12},()=>call(0,{action:'respond',response:'bad',companions:0,expected_version:0})))
      assert.equal(badRequests.filter(r=>r.code==='invalid_response').length,6);assert.equal(badRequests.filter(r=>r.code==='rate_limited').length,6)
      assert.ok(badRequests.filter(r=>r.code==='rate_limited').every(r=>r.retry_after>=1 && r.retry_after<=60))
      reset()
      const reads=await Promise.all(Array.from({length:35},()=>call()))
      assert.equal(reads.filter(r=>r.ok).length,30);assert.equal(reads.filter(r=>r.code==='rate_limited').length,5)
      sql(`update private.invitation_rate_limits set window_start=now()-interval '61 seconds' where guest_id='${guestIds[0]}';`)
      assert.equal((await call()).ok,true)
    })
    await t.test('parent locks preserve order with expired rate state and recheck deadlines after waiting',async()=>{
      reset();await call();sql(`update private.invitation_rate_limits set window_start=now()-interval '3 minutes' where guest_id='${guestIds[0]}';`)
      const command=`begin;select 1 from public.events where id='${eventId}' for update;select pg_sleep(0.4);update public.guests set group_label='Concurrency' where id='${guestIds[0]}';commit;`
      const management=promisify(execFile)('docker',['exec','-i','supabase_db_jotopa','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q','-A','-t','-c',command],{timeout:8000}).then(()=>true,()=>false)
      await new Promise(resolve=>setTimeout(resolve,180))
      const response=await call();assert.equal(response.ok,true);assert.equal(await management,true)
      reset()
      const version=response.guest.version
      const closeCommand=`begin;update public.events set rsvp_deadline=clock_timestamp()+interval '200 milliseconds' where id='${eventId}';select pg_sleep(0.5);commit;`
      const closing=promisify(execFile)('docker',['exec','-i','supabase_db_jotopa','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q','-A','-t','-c',closeCommand],{timeout:8000}).then(()=>true,()=>false)
      await new Promise(resolve=>setTimeout(resolve,180))
      failCode(await respond('maybe',0,version),'rsvp_closed');assert.equal(await closing,true)
      sql(`update public.events set rsvp_deadline=starts_at where id='${eventId}';`)
      const existing=await checked(owner.from('events').select('title,slug,type,starts_at,timezone,session_closes_at').eq('id',eventId).single())
      await checked(owner.rpc('update_event',{p_event_id:eventId,p_title:existing.title,p_slug:existing.slug,p_type:existing.type,p_starts_at:existing.starts_at,p_timezone:existing.timezone,p_rsvp_deadline:existing.starts_at,p_status:'active'}))
      assert.equal((await checked(owner.from('events').select('session_closes_at').eq('id',eventId).single())).session_closes_at,existing.session_closes_at)
    })
    await t.test('rotation invalidates the old token and audit has no tokens or contact data',async()=>{
      const old=tokens[0];tokens[0]=await checked(owner.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestIds[0],p_rotate:true}))
      assert.equal(tokens[0]===old,false)
      failCode(await checked(anonymous.rpc('guest_invitation',{p_token:old})),'invitation_unavailable')
      assert.equal((await call()).ok,true)
      const audit=await checked(owner.from('audit_log').select('action,meta,target,actor_id').eq('event_id',eventId))
      for(const action of ['guest.rsvp_updated','guest.opted_out','guest.link_rotated','guest.link_accessed']) assert.ok(audit.some(a=>a.action===action))
      const serialized=JSON.stringify(audit);assert.equal(tokens.some(token=>serialized.includes(token)),false);assert.equal(serialized.includes(old),false)
      assert.equal(serialized.includes('example.test'),false);assert.equal(serialized.includes('595981'),false)
      assert.ok(audit.filter(a=>a.action==='guest.rsvp_updated'||a.action==='guest.opted_out').every(a=>a.actor_id===null))
      assert.ok((await anonymous.schema('private').from('invitation_rate_limits').select('*')).error)
    })
    await t.test('invalid-token flood is bounded and counted even though every request is rejected',async()=>{
      const invalid=`invalid-${randomUUID()}`
      const bucket=sql(`select (get_byte(extensions.digest('${invalid}','sha256'),0)%64)::text;`).trim()
      const before=Number(sql(`select coalesce((select used from private.invitation_rate_limits where scope='global' and bucket='${bucket}'),0);`).trim())
      const results=await Promise.all(Array.from({length:125},()=>checked(anonymous.rpc('guest_invitation',{p_token:invalid}))))
      assert.ok(results.some(r=>r.code==='rate_limited'));assert.ok(results.every(r=>!r.ok && !('guest'in r)))
      const after=Number(sql(`select used from private.invitation_rate_limits where scope='global' and bucket='${bucket}';`).trim())
      assert.equal(after,121);assert.ok(after>=before)
    })
  } finally {
    if(events.length) sql(`delete from public.events where id in (${events.map(id=>`'${id}'`).join(',')});`)
    removeTestUsers(users.map(u=>u.id))
  }
})
