import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { client, sql, removeTestUsers } from './local-test-helpers.mjs'

test('local guests: CRUD, all roles, isolation, reconciliation and atomic imports', async t => {
  const roles = ['owner','manager','invitations','content','moderator','checkin','viewer','outsider']
  const users = [], events = []
  const checked = async promise => { const result = await promise; if (result.error) throw new Error(`Unexpected guest operation: ${result.error.code}/${/^[a-z_]+$/.test(result.error.message) ? result.error.message : 'database_error'}`); return result.data }
  const args = title => ({p_title:title,p_slug:`guests-${randomUUID()}`,p_type:'other',p_starts_at:'2027-07-01T20:00:00Z'})
  let eventId, otherId, guestId
  try {
    for (const role of roles) {
      const sdk = client(), email = `jotopa-guests-${randomUUID()}@example.test`
      const data = await checked(sdk.auth.signUp({email,password:`GuestTest42-${randomUUID()}`,options:{data:{full_name:`Guest test ${role}`}}}))
      users.push({sdk,id:data.user.id,role})
    }
    const byRole = role => users.find(user => user.role === role).sdk
    const owner = byRole('owner'), outsider = byRole('outsider')
    eventId = await checked(owner.rpc('create_event',args('Guest fixture'))); events.push(eventId)
    otherId = await checked(outsider.rpc('create_event',args('Isolated fixture'))); events.push(otherId)
    sql(`insert into public.event_members(event_id,user_id,role) values ${users.filter(u=>!['owner','outsider'].includes(u.role)).map(u=>`('${eventId}','${u.id}','${u.role}')`).join(',')};`)
    const save = (sdk,data,id,ev=eventId) => sdk.rpc('save_guest',{p_event_id:ev,p_data:data,...(id?{p_guest_id:id}:{})})
    const list = (sdk,extra={}) => sdk.rpc('list_guests',{p_event_id:eventId,...extra})
    const imp = (rows,batch=randomUUID(),preview=false) => owner.rpc('import_guests',{p_event_id:eventId,p_rows:rows,p_batch_id:batch,p_preview:preview})
    const row = (n,data) => ({row_number:n,data})
    const base = {full_name:'Persona de prueba',phone:'0981 123456',email:'FIRST@EXAMPLE.TEST',document_id:'1.234.567',group_label:'Familia',companions_allowed:3,contact_consent:true}
    await t.test('SQL validates public international phone metadata consistently',async()=>{
      for(const input of ['0981 123456','981123456','595981123456','00595 981 123456','+595 (981) 123-456']) assert.equal(sql(`select public.normalize_guest_phone('${input}');`).trim(),'+595981123456')
      for(const phone of ['+12025550123','+442079460018','+5491123456789','+5511987654321']) assert.equal(sql(`select public.normalize_guest_phone('${phone}');`).trim(),phone)
    })
    await t.test('real creation normalizes phone, email and document; editing and deletion work',async()=>{
      guestId = await checked(save(owner,base))
      const saved = (await checked(list(owner))).rows[0]
      assert.equal(saved.phone,'+595981123456'); assert.equal(saved.email,'first@example.test'); assert.equal(saved.document_id,'1234567')
      await checked(save(owner,{...base,full_name:'Nombre actualizado'},guestId))
      assert.equal((await checked(list(owner))).rows[0].full_name,'Nombre actualizado')
      const temporary = await checked(save(owner,{full_name:'Eliminar prueba'}))
      await checked(owner.rpc('delete_guest',{p_event_id:eventId,p_guest_id:temporary}))
      assert.equal((await checked(list(owner))).total,1)
      for (const phone of ['+999123456789','123','abc','+595981123456 ext 9']) assert.equal((await save(owner,{full_name:'Inválido',phone})).error?.message,'invalid_phone')
    })
    await t.test('all seven roles and anonymous clients obey server permissions',async()=>{
      for (const role of roles) {
        const sdk = byRole(role), full = ['owner','manager','invitations'].includes(role)
        const direct = await checked(sdk.from('guests').select('id,email,phone,document_id').eq('event_id',eventId))
        assert.equal(direct.length,full?1:0,role)
        const response = await list(sdk)
        if (full) assert.equal(response.data.scope,'full')
        else if (role==='checkin') {
          assert.equal(response.data.scope,'roster')
          assert.deepEqual(Object.keys(response.data.rows[0]).sort(),['event_id','full_name','id','table_id','table_name'])
          assert.equal((await checked(list(sdk,{p_search:'first@example.test'}))).total,0)
          assert.ok((await list(sdk,{p_contact:'with_contact'})).error)
        } else assert.equal(response.error?.code,'42501',role)
        const roster = await checked(sdk.from('guest_roster').select('*').eq('event_id',eventId))
        assert.equal(roster.length,full||role==='checkin'?1:0,role)
        if(roster.length) assert.deepEqual(Object.keys(roster[0]).sort(),['event_id','full_name','id','table_id'])
        const mutation = await save(sdk,{full_name:`Created ${role}`})
        assert.equal(Boolean(mutation.error),!full,role)
        if(full) await checked(sdk.rpc('delete_guest',{p_event_id:eventId,p_guest_id:mutation.data}))
        if(!full) {
          assert.ok((await sdk.rpc('delete_guest',{p_event_id:eventId,p_guest_id:guestId})).error)
          assert.ok((await sdk.rpc('import_guests',{p_event_id:eventId,p_rows:[row(2,{full_name:'Forbidden'})],p_batch_id:randomUUID()})).error)
          assert.ok((await sdk.rpc('export_guests',{p_event_id:eventId})).error)
        }
      }
      assert.ok((await list(client())).error)
      assert.ok((await client().from('guest_roster').select('*')).error)
    })
    await t.test('cross-event DML, reserved fields and duplicate contacts are blocked without leaking values',async()=>{
      await checked(save(outsider,base,null,otherId))
      assert.equal((await checked(owner.from('guests').select('id,email').eq('event_id',otherId))).length,0)
      assert.ok((await save(owner,{full_name:'Wrong event'},guestId,otherId)).error)
      const otherGuest = (await checked(outsider.rpc('list_guests',{p_event_id:otherId}))).rows[0].id
      assert.equal((await save(owner,{full_name:'Wrong guest'},otherGuest)).error?.message,'guest_unavailable')
      assert.ok((await owner.rpc('delete_guest',{p_event_id:eventId,p_guest_id:otherGuest})).error)
      for (const field of ['invite_token','rsvp_status','opted_out','table_id']) {
        if (field==='invite_token') assert.ok((await owner.from('guests').select(field)).error)
        assert.equal((await save(owner,{full_name:'Privilege attempt',[field]:'yes'})).error?.message,'invalid_guest')
      }
      assert.ok((await owner.from('guests').insert({event_id:eventId,full_name:'Direct insert'})).error)
      assert.ok((await owner.from('guests').update({full_name:'Direct update'}).eq('id',guestId)).error)
      assert.ok((await owner.from('guests').delete().eq('id',guestId)).error)
      for(const data of [{email:'FIRST@example.test'},{phone:'+595981123456'},{document_id:'1-234-567'}]) {
        const result = await save(owner,{full_name:'Duplicate',...data})
        assert.equal(result.error?.message,'guest_duplicate'); assert.equal(result.error?.details,'')
      }
      assert.ok((await owner.rpc('normalize_guest_input',{p_data:base})).error)
    })
    await t.test('preview writes nothing; import reconciles and preserves blanks but accepts explicit zero/false',async()=>{
      const rows = [row(2,{full_name:'Import update',email:'first@example.test',companions_allowed:0,contact_consent:false}),row(3,{full_name:'Nueva persona',phone:'+12025550123'}),row(4,{full_name:'X'})]
      const before = sql(`select count(*) from public.audit_log where event_id='${eventId}';`).trim()
      const batch = randomUUID(), preview = await checked(imp(rows,batch,true))
      assert.equal(preview.created,1);assert.equal(preview.updated,1);assert.equal(preview.rejected,1)
      assert.equal((await checked(list(owner))).total,1)
      assert.equal(sql(`select count(*) from public.audit_log where event_id='${eventId}';`).trim(),before)
      assert.equal((await checked(list(owner))).rows[0].full_name,'Nombre actualizado')
      const committed = await checked(imp(rows,batch))
      assert.equal(committed.created,1);assert.equal(committed.updated,1);assert.equal(committed.rejected,1)
      const existing = (await checked(list(owner))).rows.find(g=>g.id===guestId)
      assert.equal(existing.phone,'+595981123456');assert.equal(existing.group_label,'Familia');assert.equal(existing.companions_allowed,0);assert.equal(existing.contact_consent,false)
      const repeat = await checked(imp(rows,batch)); assert.equal(repeat.replayed,true);assert.equal((await checked(list(owner))).total,2)
      assert.equal((await imp([row(2,{full_name:'Other payload'})],batch)).error?.message,'import_batch_conflict')
    })
    await t.test('ambiguous identities and file duplicates never merge or overwrite people',async()=>{
      const conflict = await checked(imp([row(2,{full_name:'Conflict',email:'first@example.test',phone:'+12025550123'})]))
      assert.equal(conflict.rows[0].reason,'identity_conflict')
      for(const field of ['email','phone','document_id']) {
        const value = {email:'dupe@example.test',phone:'+442079460018',document_id:'ABC123'}[field]
        const result = await checked(imp([row(2,{full_name:'One',[field]:value}),row(3,{full_name:'Two',[field]:value})]))
        assert.equal(result.rejected,2); assert.ok(result.rows.every(r=>r.reason==='file_duplicate'))
      }
      const repeated = await checked(imp([row(2,{full_name:'First',email:'first@example.test'}),row(3,{full_name:'Second',document_id:'1234567'})]))
      assert.equal(repeated.rejected,2);assert.ok(repeated.rows.every(r=>r.reason==='target_repeated'))
      const batch = randomUUID(), payload = [row(2,{full_name:'Sin identificadores'})]
      const concurrent = await Promise.all([imp(payload,batch),imp(payload,batch)]).then(results=>results.map(r=>{assert.equal(r.error,null);return r.data}))
      assert.equal(concurrent.filter(r=>r.replayed).length,1)
      assert.equal((await checked(list(owner))).total,3)
      assert.ok((await imp([row(2,base),row(2,base)])).error)
      assert.ok((await imp(Array.from({length:1001},(_,i)=>row(i+2,{full_name:'Too many'})))).error)
    })
    await t.test('search, group/contact filters, pagination and export stay inside event scope',async()=>{
      const bulk = Array.from({length:30},(_,i)=>row(i+2,{full_name:`Paginated ${String(i).padStart(2,'0')}`,group_label:'Trabajo'}))
      assert.equal((await checked(imp(bulk))).created,30)
      const first = await checked(list(owner,{p_group:'Trabajo',p_page_size:25})), second = await checked(list(owner,{p_group:'Trabajo',p_page:1,p_page_size:25}))
      assert.equal(first.total,30); assert.equal(first.rows.length,25);assert.equal(second.rows.length,5)
      assert.equal(new Set([...first.rows,...second.rows].map(g=>g.id)).size,30)
      assert.equal((await checked(list(owner,{p_search:'first@example.test'}))).total,1)
      assert.equal((await checked(list(owner,{p_contact:'with_contact'}))).total,2)
      const exported = await checked(owner.rpc('export_guests',{p_event_id:eventId,p_group:'Trabajo'}))
      assert.equal(exported.length,30);assert.ok(exported.every(g=>g.event_id===eventId && !('invite_token'in g) && g.rsvp_status==='pending'))
    })
    await t.test('guest audit is immutable and contains no personal values',async()=>{
      const audit = await checked(owner.from('audit_log').select('action,target,meta,actor_id').eq('event_id',eventId).like('action','guest%'))
      for(const action of ['guest.created','guest.updated','guest.deleted','guests.imported']) assert.ok(audit.some(a=>a.action===action))
      assert.ok(audit.every(a=>a.actor_id===users[0].id || users.some(u=>u.id===a.actor_id)))
      const serialized = JSON.stringify(audit)
      for(const personal of ['example.test','595981','Persona','1234567','Trabajo']) assert.equal(serialized.includes(personal),false)
      assert.ok((await owner.from('audit_log').update({meta:{fake:true}}).eq('event_id',eventId)).error)
      const reserved = sql(`select count(*) from public.guests where event_id='${eventId}' and (invite_token is null or rsvp_status<>'pending' or rsvp_at is not null or opted_out);`).trim()
      assert.equal(reserved,'0')
    })
    await t.test('maximum-size batch previews 1,000 rows against the real API without persisting them',async()=>{
      const before=(await checked(list(owner))).total
      const result=await checked(imp(Array.from({length:1000},(_,i)=>row(i+2,{full_name:`Maximum batch ${i}`,document_id:`MAX${String(i).padStart(5,'0')}`})),randomUUID(),true))
      assert.equal(result.created,1000);assert.equal(result.rejected,0);assert.equal((await checked(list(owner))).total,before)
    })
  } finally {
    if(events.length) sql(`delete from public.events where id in (${events.map(id=>`'${id}'`).join(',')});`)
    removeTestUsers(users.map(user=>user.id))
  }
})
