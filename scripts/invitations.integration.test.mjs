import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {test} from 'node:test'
import {client,sql,removeTestUsers} from './local-test-helpers.mjs'

const checked=async promise=>{const r=await promise;if(r.error) throw new Error(`Invitation operation failed: ${r.error.code}/${/^[a-z_]+$/.test(r.error.message)?r.error.message:'database_error'}`);return r.data}
test('real invitation delivery, tracking, seven roles and opt-out isolation',async t=>{
  const users=[],events=[],guestIds=[],tokens=[],anonymous=client()
  let eventId,otherId,templateId
  try {
    for(const role of ['owner','manager','invitations','content','moderator','checkin','viewer','outsider']){
      const sdk=client(),data=await checked(sdk.auth.signUp({email:`jotopa-delivery-${randomUUID()}@example.test`,password:`Delivery42-${randomUUID()}`,options:{data:{full_name:`Delivery ${role}`}}}));users.push({sdk,id:data.user.id,role})
    }
    const owner=users[0].sdk,outsider=users.at(-1).sdk,args=title=>({p_title:title,p_slug:`delivery-${randomUUID()}`,p_type:'other',p_starts_at:new Date(Date.now()+86400000*10).toISOString()})
    eventId=await checked(owner.rpc('create_event',args('Delivery fixture')));events.push(eventId)
    otherId=await checked(outsider.rpc('create_event',args('Other delivery fixture')));events.push(otherId)
    sql(`insert into public.event_members(event_id,user_id,role) values ${users.slice(1,-1).map(u=>`('${eventId}','${u.id}','${u.role}')`).join(',')};update public.events set status='active' where id in ('${eventId}','${otherId}');`)
    for(const [name,consent,phone] of [['First guest',true,'+595981123456'],['Second guest',true,'+12025550123'],['No phone',true,null],['No consent',false,null],['Opted out',true,null]]){
      const id=await checked(owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:name,contact_consent:consent,phone,companions_allowed:2}}));guestIds.push(id);tokens.push(await checked(owner.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:id})))
    }
    const foreignGuest=await checked(outsider.rpc('save_guest',{p_event_id:otherId,p_data:{full_name:'Foreign guest',contact_consent:true}}))
    templateId=(await checked(owner.from('message_templates').select('id').eq('event_id',eventId)))[0].id
    const queue=(sdk=owner,bucket='pending')=>sdk.rpc('list_invitation_queue',{p_event_id:eventId,p_bucket:bucket})
    const action=(index,name,request=randomUUID(),reference,sdk=owner)=>sdk.rpc('manual_invitation_action',{p_event_id:eventId,p_guest_id:guestIds[index],p_action:name,p_request_id:request,p_template_id:templateId,...(reference?{p_reference_id:reference}:{})})
    const history=(index=0)=>owner.rpc('get_guest_invitation_history',{p_event_id:eventId,p_guest_id:guestIds[index]})
    const tracking=async(index=0)=>(await checked(owner.rpc('get_guest_invitation_tracking',{p_event_id:eventId,p_guest_ids:[guestIds[index]]})))[0]
    const open=(index,visit=randomUUID())=>anonymous.rpc('guest_invitation',{p_token:tokens[index],p_request:{action:'read',visit_id:visit}})
    await t.test('RLS, direct DML and all seven role permissions are enforced independently of UI',async()=>{
      for(const user of users){
        const allowed=['owner','manager','invitations'].includes(user.role)
        assert.equal((await checked(user.sdk.from('invitations').select('id').eq('event_id',eventId))).length,allowed?5:0)
        assert.equal((await checked(user.sdk.from('message_templates').select('id').eq('event_id',eventId))).length,allowed?1:0)
        const q=await queue(user.sdk);assert.equal(Boolean(q.error),!allowed)
        const payload=await user.sdk.rpc('prepare_invitation_message',{p_event_id:eventId,p_guest_id:guestIds[0],p_template_id:templateId});assert.equal(Boolean(payload.error),!allowed)
        if(!allowed){assert.ok((await action(0,'send',randomUUID(),undefined,user.sdk)).error);assert.ok((await user.sdk.rpc('get_guest_invitation_history',{p_event_id:eventId,p_guest_id:guestIds[0]})).error)}
      }
      assert.ok((await queue(anonymous)).error)
      for(const table of ['invitations','invitation_events','message_templates']){
        assert.ok((await anonymous.from(table).select('id')).error)
        assert.ok((await owner.from(table).insert({event_id:eventId})).error)
        assert.ok((await owner.from(table).update({event_id:otherId}).eq('event_id',eventId)).error)
        assert.ok((await owner.from(table).delete().eq('event_id',eventId)).error)
      }
      assert.ok((await owner.rpc('prepare_invitation_message',{p_event_id:eventId,p_guest_id:foreignGuest,p_template_id:templateId})).error)
      assert.equal((await checked(owner.from('invitations').select('id').eq('event_id',otherId))).length,0)
      assert.equal((await checked(outsider.from('invitation_events').select('id').eq('event_id',eventId))).length,0)
    })
    await t.test('templates validate variables, bound size and reject embedded bearer tokens',async()=>{
      const body='Hola {nombre}, {fecha} en {lugar}. Tu invitación: {link}. Hasta {fecha_limite}.'
      await checked(owner.rpc('save_message_template',{p_event_id:eventId,p_template_id:templateId,p_name:'Personalizada',p_body:body,p_location_label:'Jardín de prueba'}))
      for(const invalid of ['Sin enlace','{link} {otro}','{link} {','{link} '+tokens[0],'x'.repeat(2001)+'{link}']) assert.ok((await owner.rpc('save_message_template',{p_event_id:eventId,p_name:'Invalid',p_body:invalid})).error)
      assert.ok((await owner.rpc('save_message_template',{p_event_id:eventId,p_name:'Invalid place',p_body:'{link}',p_location_label:tokens[0]})).error)
      assert.ok((await users[3].sdk.rpc('save_message_template',{p_event_id:eventId,p_name:'Forbidden',p_body:body})).error)
      const extra=await checked(owner.rpc('save_message_template',{p_event_id:eventId,p_name:'Archivable',p_body:'Hola {nombre} {link}'}))
      await checked(owner.rpc('archive_message_template',{p_event_id:eventId,p_template_id:extra}))
      assert.ok((await owner.rpc('prepare_invitation_message',{p_event_id:eventId,p_guest_id:guestIds[0],p_template_id:extra})).error)
    })
    await t.test('queue excludes opted-out and unconsented guests; missing phone remains copy-only',async()=>{
      await checked(anonymous.rpc('guest_invitation',{p_token:tokens[4],p_request:{action:'opt_out'}}))
      const q=await checked(queue());assert.equal(q.total,3);assert.ok(q.rows.every(g=>![guestIds[3],guestIds[4]].includes(g.guest_id)))
      assert.equal(q.rows.find(g=>g.guest_id===guestIds[2]).phone_state,'missing')
      for(const index of [3,4]){
        assert.ok((await action(index,'send')).error);assert.ok((await action(index,'copy_message')).error)
        assert.ok((await owner.rpc('prepare_invitation_message',{p_event_id:eventId,p_guest_id:guestIds[index],p_template_id:templateId})).error)
      }
      assert.equal((await action(2,'send')).error?.message,'invitation_invalid_phone')
      assert.equal((await tracking(2)).status,'pending')
    })
    await t.test('manual sends are atomic/idempotent and cannot claim delivery or WhatsApp reading',async()=>{
      const request=randomUUID(),sent=await checked(action(0,'send',request));assert.equal(sent.payload.token===tokens[0],true)
      const retry=await checked(action(0,'send',request));assert.equal(retry.replayed,true)
      const another=await checked(owner.rpc('save_message_template',{p_event_id:eventId,p_name:'Different template',p_body:'Otro {link}'}))
      assert.equal((await owner.rpc('manual_invitation_action',{p_event_id:eventId,p_guest_id:guestIds[0],p_action:'send',p_request_id:request,p_template_id:another})).error?.message,'invitation_request_conflict')
      assert.equal((await tracking()).status,'sent')
      const rows=await checked(owner.from('invitations').select('channel,sent_at,sent_marked_by,delivered_at,open_count').eq('guest_id',guestIds[0]))
      const wa=rows.find(r=>r.channel==='whatsapp');assert.equal(wa.sent_marked_by,users[0].id);assert.ok(wa.sent_at);assert.equal(wa.delivered_at,null);assert.equal(wa.open_count,0)
      assert.equal((await checked(history())).rows.filter(h=>h.type==='sent').length,1)
      assert.ok((await action(1,'send',request)).error)
      assert.ok((await action(0,'send')).error)
      await checked(action(0,'undo',randomUUID(),request));assert.equal((await tracking()).status,'pending')
      assert.equal((await action(0,'send',request)).error?.message,'stale_invitation_action')
    })
    await t.test('skip, retry, failures and copied/shared links have distinct truthful histories',async()=>{
      await checked(action(2,'skip'));assert.ok((await checked(queue(owner,'skipped'))).rows.some(g=>g.guest_id===guestIds[2]))
      await checked(action(2,'retry'));await checked(action(2,'failed'));assert.ok((await checked(queue(owner,'failed'))).rows.some(g=>g.guest_id===guestIds[2]))
      await checked(action(2,'retry'));await checked(action(2,'copy_message'));await checked(action(2,'copy_link'));assert.equal((await tracking(2)).status,'pending')
      const request=randomUUID();await checked(action(2,'shared',request));assert.equal((await tracking(2)).status,'sent')
      await checked(action(2,'failed',randomUUID(),request));assert.equal((await tracking(2)).status,'pending')
      assert.ok((await checked(queue(owner,'failed'))).rows.some(g=>g.guest_id===guestIds[2]))
      const h=await checked(history(2));for(const type of ['skipped','resumed','failed','copy_requested','link_copy_requested','sent'])assert.ok(h.rows.some(event=>event.type===type))
      assert.ok(h.rows.every(event=>!('visit_id'in event)&&!('request_id'in event)))
    })
    await t.test('real token openings are deduplicated per visit and across the 60-second coalescing window',async()=>{
      const request=randomUUID();await checked(action(0,'send',request))
      const visit=randomUUID();const parallel=await Promise.all(Array.from({length:8},()=>open(0,visit)));assert.ok(parallel.every(r=>r.data.ok))
      let state=await tracking();assert.equal(state.status,'opened');assert.equal(state.open_count,1);assert.equal(state.first_opened_at,state.last_opened_at)
      await checked(open(0));assert.equal((await tracking()).open_count,1)
      sql(`update public.invitations set first_opened_at=now()-interval '2 minutes',last_opened_at=now()-interval '61 seconds' where guest_id='${guestIds[0]}' and channel='link';`)
      await checked(open(0,visit));assert.equal((await tracking()).open_count,1)
      await checked(open(0));state=await tracking();assert.equal(state.open_count,2);assert.ok(Date.parse(state.last_opened_at)>Date.parse(state.first_opened_at))
      await checked(action(0,'undo',randomUUID(),request));assert.equal((await tracking()).status,'opened')
      assert.equal((await checked(history())).rows.filter(h=>h.type==='opened').length,2)
      assert.ok(!(await checked(queue())).rows.some(g=>g.guest_id===guestIds[0]))
    })
    await t.test('RSVP updates append immutable history and repeated identical replies do not duplicate it',async()=>{
      const response={action:'respond',response:'yes',companions:2,expected_version:0}
      await checked(anonymous.rpc('guest_invitation',{p_token:tokens[0],p_request:response}));assert.equal((await tracking()).status,'responded')
      await checked(anonymous.rpc('guest_invitation',{p_token:tokens[0],p_request:response}))
      await checked(anonymous.rpc('guest_invitation',{p_token:tokens[0],p_request:{...response,response:'no',companions:0,expected_version:1}}))
      const h=await checked(history());const replies=h.rows.filter(e=>e.type==='rsvp');assert.equal(replies.length,2)
      assert.equal(replies[0].meta.response,'no');assert.equal(replies[1].meta.companions,2)
      assert.equal((await tracking(1)).status,'pending')
      assert.ok(!(await checked(queue())).rows.some(g=>g.guest_id===guestIds[0]))
    })
    await t.test('concurrent host attempts commit only once, and late opt-out blocks stale prepared messages',async()=>{
      const attempts=await Promise.all([action(1,'send'),action(1,'send')]);assert.equal(attempts.filter(r=>!r.error).length,1)
      const succeeded=attempts.find(r=>!r.error).data.request_id
      await checked(action(1,'undo',randomUUID(),succeeded))
      await checked(owner.rpc('prepare_invitation_message',{p_event_id:eventId,p_guest_id:guestIds[1],p_template_id:templateId}))
      const optedOut=await checked(anonymous.rpc('guest_invitation',{p_token:tokens[1],p_request:{action:'opt_out'}}))
      assert.equal(optedOut.ok,true);assert.equal(optedOut.guest.opted_out,true)
      assert.equal((await action(1,'send')).error?.message,'contact_not_authorized')
      assert.equal((await tracking(1)).status,'pending')
    })
    await t.test('send quota survives undo and timeline/audit contain no tokens, rendered text or contacts',async()=>{
      await checked(action(2,'retry'))
      for(let i=0;i<4;i++){const id=randomUUID();await checked(action(2,'shared',id));await checked(action(2,'undo',randomUUID(),id))}
      assert.equal((await action(2,'shared')).error?.message,'invitation_guest_limit')
      const audit=await checked(owner.from('audit_log').select('action,meta').eq('event_id',eventId))
      const h=await checked(owner.from('invitation_events').select('type,meta').eq('event_id',eventId))
      const serialized=JSON.stringify([...audit,...h]);assert.equal(tokens.some(token=>serialized.includes(token)),false)
      for(const content of ['+595981','+120255','Hola ','Jardín','example.test'])assert.equal(serialized.includes(content),false)
      assert.ok(audit.some(e=>e.action==='invitation.sent'));assert.ok(audit.some(e=>e.action==='template.saved'))
    })
    await t.test('queue pagination and tracking batches preserve scope without duplicate rows',async()=>{
      for(let i=0;i<30;i++)await checked(owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:`Paged guest ${String(i).padStart(2,'0')}`,contact_consent:true}}))
      const first=await checked(queue()),second=await checked(owner.rpc('list_invitation_queue',{p_event_id:eventId,p_page:1}))
      assert.equal(first.rows.length,25);assert.equal(first.total,31);assert.equal(second.rows.length,6)
      assert.equal(new Set([...first.rows,...second.rows].map(row=>row.guest_id)).size,31)
      assert.equal((await checked(owner.rpc('get_guest_invitation_tracking',{p_event_id:eventId,p_guest_ids:[foreignGuest]}))).length,0)
      assert.ok((await owner.rpc('get_guest_invitation_tracking',{p_event_id:eventId,p_guest_ids:[...first.rows,...second.rows].map(row=>row.guest_id)})).error)
    })
  } finally {
    if(events.length)sql(`delete from public.events where id in (${events.map(id=>`'${id}'`).join(',')});`)
    removeTestUsers(users.map(u=>u.id))
  }
})
