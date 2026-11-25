import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {client,sql,removeTestUsers} from './local-test-helpers.mjs'

const checked=async promise=>{const result=await promise;if(result.error)throw Object.assign(new Error('Local attendance operation failed'),{code:result.error.code,reason:result.error.message});return result.data}
test('stage B: binary attendance, whole-party capacities, tables and permission isolation',async suite=>{
  const users=[],events=[],guests=[],tokens=new Map(),anonymous=client();let eventId,otherId
  try{
    for(const role of ['owner','manager','invitations','content','moderator','checkin','viewer','outsider']){const sdk=client(),account=await checked(sdk.auth.signUp({email:`jotopa-seating-${randomUUID()}@example.test`,password:`Seating42-${randomUUID()}`}));users.push({sdk,id:account.user.id,role})}
    const owner=users[0].sdk,content=users[3].sdk
    for(const sdk of [owner,users[7].sdk]){const id=await checked(sdk.rpc('create_event',{p_title:'Attendance fixture',p_slug:`seating-${randomUUID()}`,p_type:'other',p_starts_at:new Date(Date.now()+10*86400000).toISOString()}));events.push(id);sql(`update public.events set status='active',rsvp_deadline=now()+interval '9 days' where id='${id}';`)}
    [eventId,otherId]=events
    for(const user of users.slice(1,7))sql(`insert into public.event_members(event_id,user_id,role) values('${eventId}','${user.id}','${user.role}');`)
    const create=async(name,size)=>{const id=await checked(owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:name,party_size:size,email:`person-${randomUUID()}@example.test`,contact_consent:true}}));guests.push(id);tokens.set(id,await checked(owner.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:id})));return id}
    const reset=id=>sql(`delete from private.invitation_rate_limits where guest_id='${id}';`)
    const read=id=>checked(anonymous.rpc('guest_invitation',{p_token:tokens.get(id),p_request:{action:'read'}}))
    const respond=async(id,response,count)=>{reset(id);const snapshot=await read(id);return checked(anonymous.rpc('guest_invitation',{p_token:tokens.get(id),p_request:{action:'respond',response,attending_count:count,expected_version:snapshot.guest.version}}))}
    let individual,pair,family,maximum,table8,table9
    await suite.test('independent recipient names and total capacities preserve legacy storage without exceeding 21 people',async()=>{
      individual=await create('Juan Pérez',1);pair=await create('Carlos y María',2);family=await create('Familia González',5);maximum=await create('Un nombre libre',21)
      for(const [id,size] of [[individual,1],[pair,2],[family,5],[maximum,21]]){const snapshot=await read(id);assert.equal(snapshot.guest.party_size,size);assert.equal(snapshot.guest.companions_allowed,size-1);assert.equal(snapshot.guest.attending_count,0)}
      for(const value of [0,22,-1,1.5,'5'])assert.ok((await owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Invalid capacity',party_size:value}})).error)
      for(const patch of [{party_size:5,companions_allowed:1},{party_size:1,attending_count:1},{party_size:1,table_id:randomUUID()},{party_size:1,rsvp_status:'yes'}])assert.ok((await owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Protected',...patch}})).error)
      const legacy=await checked(owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Legacy extra',companions_allowed:4}}));assert.equal((await checked(owner.from('guests').select('party_size').eq('id',legacy).single())).party_size,5);await checked(owner.rpc('delete_guest',{p_event_id:eventId,p_guest_id:legacy}))
    })
    await suite.test('individual, pair, family, maximum, partial and negative replies are checked by Postgres',async()=>{
      for(const [id,count] of [[individual,1],[pair,2],[family,3],[maximum,21]]){const reply=await respond(id,'yes',count);assert.equal(reply.ok,true);assert.equal(reply.guest.attending_count,count);assert.equal(reply.guest.companions_confirmed,count-1)}
      const no=await respond(family,'no',0);assert.equal(no.guest.attending_count,0);assert.equal(no.guest.companions_confirmed,0)
      const again=await respond(family,'yes',2);assert.equal(again.guest.attending_count,2);assert.equal(again.guest.party_size,5)
      for(const [response,count,code] of [['yes',6,'invalid_attendance'],['yes',0,'invalid_attendance'],['no',1,'invalid_attendance'],['maybe',0,'invalid_response']])assert.equal((await respond(family,response,count)).code,code)
      assert.ok((await owner.rpc('save_guest',{p_event_id:eventId,p_guest_id:family,p_data:{full_name:'Familia González',party_size:1}})).error)
      assert.equal((await read(family)).guest.party_size,5)
      const version=(await read(family)).guest.version;reset(family)
      const identical=await checked(anonymous.rpc('guest_invitation',{p_token:tokens.get(family),p_request:{action:'respond',response:'yes',attending_count:2,expected_version:0}}));assert.equal(identical.guest.version,version)
    })
    await suite.test('table CRUD and seven roles enforce RLS without leaking contacts or accepting foreign pointers',async()=>{
      table8=await checked(owner.rpc('save_event_table',{p_event_id:eventId,p_name:'Mesa 8'}));table9=await checked(owner.rpc('save_event_table',{p_event_id:eventId,p_name:'Mesa 9'}))
      assert.ok((await owner.rpc('save_event_table',{p_event_id:eventId,p_name:' mesa 8 '})).error)
      for(const user of users){
        const readable=['owner','manager','invitations','content','checkin'].includes(user.role),assignable=['owner','manager','invitations','content'].includes(user.role),writable=['owner','manager','content'].includes(user.role)
        const tableRows=await checked(user.sdk.from('event_tables').select('*').eq('event_id',eventId));assert.equal(tableRows.length,readable?2:0)
        assert.equal(Boolean((await user.sdk.rpc('list_seating_guests',{p_event_id:eventId})).error),!assignable)
        assert.equal(Boolean((await user.sdk.rpc('assign_guest_table',{p_event_id:eventId,p_guest_id:family,p_table_id:table8})).error),!assignable)
        const edited=await user.sdk.rpc('save_event_table',{p_event_id:eventId,p_table_id:table9,p_name:'Mesa 9'});assert.equal(Boolean(edited.error),!writable)
        assert.equal(Boolean((await user.sdk.rpc('configure_table_visibility',{p_event_id:eventId,p_visible:false})).error),!['owner','manager'].includes(user.role))
        assert.ok((await user.sdk.from('event_tables').update({name:'Spoof'}).eq('id',table8)).error)
        if(['content','checkin','viewer','moderator','outsider'].includes(user.role))assert.equal((await checked(user.sdk.from('guests').select('email').eq('event_id',eventId))).length,0)
      }
      const roster=await checked(content.rpc('list_seating_guests',{p_event_id:eventId}));for(const row of roster.rows)assert.deepEqual(Object.keys(row).sort(),['attending_count','full_name','id','party_size','rsvp_status','table_id','table_name'])
      const foreign=await checked(users[7].sdk.rpc('save_event_table',{p_event_id:otherId,p_name:'Other private table'}))
      assert.ok((await owner.rpc('assign_guest_table',{p_event_id:eventId,p_guest_id:family,p_table_id:foreign})).error)
      assert.throws(()=>sql(`update public.guests set table_id='${foreign}' where id='${family}';`))
      assert.ok((await owner.rpc('delete_event_table',{p_event_id:eventId,p_table_id:table8})).error)
      const empty=await checked(owner.rpc('save_event_table',{p_event_id:eventId,p_name:'Temporary'}));await checked(owner.rpc('delete_event_table',{p_event_id:eventId,p_table_id:empty}))
      assert.ok((await anonymous.from('event_tables').select('*')).error)
    })
    await suite.test('public links expose only their assigned table after explicit visibility, including after RSVP closes',async()=>{
      reset(family);assert.equal((await read(family)).guest.table_name,null)
      await checked(owner.rpc('configure_table_visibility',{p_event_id:eventId,p_visible:true}));const visible=await read(family);assert.equal(visible.guest.table_name,'Mesa 8');assert.equal((await read(individual)).guest.table_name,null)
      assert.equal(JSON.stringify(visible).includes('Mesa 9'),false);assert.equal('table_id'in visible.guest,false)
      sql(`update public.events set rsvp_deadline=clock_timestamp()-interval '1 second' where id='${eventId}';`)
      assert.equal((await respond(family,'no',0)).code,'rsvp_closed');const closed=await read(family);assert.equal(closed.ok,true);assert.equal(closed.can_respond,false);assert.equal(closed.guest.table_name,'Mesa 8')
      sql(`update public.events set rsvp_deadline=starts_at where id='${eventId}';`)
      assert.throws(()=>sql(`update public.events set rsvp_deadline=null where id='${eventId}';`))
    })
    await suite.test('assignment imports preview without writes, reconcile safely, reject duplicates and replay idempotently',async()=>{
      const email=(await checked(owner.from('guests').select('email').eq('id',pair).single())).email
      const batch=randomUUID(),rows=[{row_number:2,data:{guest_id:individual,table_name:'Mesa 9'}},{row_number:3,data:{email,table_name:'mesa 8'}},{row_number:4,data:{guest_id:family,table_name:'Unknown'}},{row_number:5,data:{guest_id:randomUUID(),table_name:'Mesa 9'}}]
      const preview=await checked(owner.rpc('import_table_assignments',{p_event_id:eventId,p_rows:rows,p_batch_id:batch,p_preview:true}));assert.equal(preview.assigned,2);assert.equal(preview.rejected,2);assert.equal((await read(individual)).guest.table_name,null)
      const saved=await checked(owner.rpc('import_table_assignments',{p_event_id:eventId,p_rows:rows,p_batch_id:batch}));assert.equal(saved.assigned,2);assert.equal((await read(individual)).guest.table_name,'Mesa 9');assert.equal((await read(pair)).guest.table_name,'Mesa 8')
      const replay=await checked(owner.rpc('import_table_assignments',{p_event_id:eventId,p_rows:rows,p_batch_id:batch}));assert.equal(replay.replayed,true)
      assert.ok((await owner.rpc('import_table_assignments',{p_event_id:eventId,p_rows:[rows[0]],p_batch_id:batch})).error)
      const duplicates=await checked(owner.rpc('import_table_assignments',{p_event_id:eventId,p_rows:[{row_number:2,data:{guest_id:pair,table_name:''}},{row_number:3,data:{email,table_name:'Mesa 9'}}],p_batch_id:randomUUID()}));assert.equal(duplicates.assigned,0);assert.equal(duplicates.rejected,2)
      const restricted=await checked(content.rpc('import_table_assignments',{p_event_id:eventId,p_rows:[{row_number:2,data:{email,table_name:'Mesa 9'}}],p_batch_id:randomUUID()}));assert.equal(restricted.rows[0].reason,'contact_not_authorized')
      const allowed=await checked(content.rpc('import_table_assignments',{p_event_id:eventId,p_rows:[{row_number:2,data:{guest_id:pair,table_name:'Mesa 8'}}],p_batch_id:randomUUID()}));assert.equal(allowed.assigned,1)
    })
    await suite.test('unexpected import errors roll back every assignment and its audit',async()=>{
      sql(`create function private.stage_b_injected_failure() returns trigger language plpgsql as $$ begin if new.id='${pair}'::uuid and new.table_id='${table9}'::uuid then raise exception 'injected_failure';end if;return new;end;$$;create trigger stage_b_failure before update of table_id on public.guests for each row execute function private.stage_b_injected_failure();`)
      try{
        const rows=[{row_number:2,data:{guest_id:individual,table_name:'Mesa 8'}},{row_number:3,data:{guest_id:pair,table_name:'Mesa 9'}}],batch=randomUUID()
        assert.ok((await owner.rpc('import_table_assignments',{p_event_id:eventId,p_rows:rows,p_batch_id:batch})).error)
        assert.equal((await read(individual)).guest.table_name,'Mesa 9');assert.equal((await read(pair)).guest.table_name,'Mesa 8')
        assert.equal((await checked(owner.from('audit_log').select('id').eq('event_id',eventId).eq('target',batch))).length,0)
      }finally{sql('drop trigger stage_b_failure on public.guests;drop function private.stage_b_injected_failure();')}
    })
    await suite.test('summary and table occupancy count people separately from invitations and update after response changes',async()=>{
      await respond(family,'yes',3)
      sql(`insert into public.invitations(event_id,guest_id,channel) values('${eventId}','${individual}','whatsapp');`)
      const summary=await checked(owner.rpc('event_attendance_summary',{p_event_id:eventId}));assert.deepEqual(summary,{invitations:4,authorized_people:29,confirmed_invitations:4,confirmed_people:27,declined_invitations:0,pending_invitations:0,assigned_people:6,total_tables:2,available_tables:0})
      const occupancy=await checked(owner.rpc('list_event_tables',{p_event_id:eventId}));assert.equal(occupancy.find(row=>row.id===table8).confirmed_people,5);assert.equal(occupancy.find(row=>row.id===table8).authorized_people,7)
      await respond(pair,'no',0);const changed=await checked(users[6].sdk.rpc('event_attendance_summary',{p_event_id:eventId}));assert.equal(changed.confirmed_people,25);assert.equal(changed.assigned_people,4);assert.equal(changed.declined_invitations,1);assert.equal(changed.confirmed_invitations,3)
      for(const user of [users[3],users[4],users[5],users[7]])assert.ok((await user.sdk.rpc('event_attendance_summary',{p_event_id:eventId})).error)
      await checked(owner.rpc('assign_guest_table',{p_event_id:eventId,p_guest_id:individual}));assert.equal((await read(individual)).guest.table_name,null);await checked(owner.rpc('delete_event_table',{p_event_id:eventId,p_table_id:table9}))
    })
    await suite.test('concurrent RSVP changes preserve version checks and sensitive audit remains immutable',async()=>{
      reset(family);const current=await read(family),request={action:'respond',expected_version:current.guest.version}
      const replies=await Promise.all([checked(anonymous.rpc('guest_invitation',{p_token:tokens.get(family),p_request:{...request,response:'yes',attending_count:5}})),checked(anonymous.rpc('guest_invitation',{p_token:tokens.get(family),p_request:{...request,response:'no',attending_count:0}}))]);assert.equal(replies.filter(reply=>reply.ok).length,1);assert.equal(replies.filter(reply=>reply.code==='response_changed').length,1)
      const audit=await checked(owner.from('audit_log').select('action,meta').eq('event_id',eventId));assert.ok(audit.some(row=>row.action==='guest.table_assigned'));assert.ok(audit.some(row=>row.action==='tables.imported'));assert.ok(audit.some(row=>row.action==='tables.visibility_changed'))
      const serialized=JSON.stringify(audit);for(const token of tokens.values())assert.equal(serialized.includes(token),false);assert.equal(serialized.includes('Familia González'),false)
      assert.ok((await owner.from('audit_log').update({meta:{spoof:true}}).eq('event_id',eventId)).error)
      assert.throws(()=>sql(`set role anon;select * from private.legacy_maybe_responses;`))
    })
  }finally{for(const id of events)sql(`delete from public.events where id='${id}';`);removeTestUsers(users.map(user=>user.id))}
})
