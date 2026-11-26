import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium} from '@playwright/test'
import {client,sql,removeTestUsers} from './local-test-helpers.mjs'
import {webpFixtures,uploadFixture,cleanupDesign,designFixture} from './design-test-helpers.mjs'
import {informationFixture} from './information-test-helpers.mjs'

const checked=async promise=>{const result=await promise;if(result.error)throw new Error(`Information fixture request failed (${result.error.code??'request'})`);return result.data}
test('stage A information: publication, privacy, images, roles and legacy compatibility',async suite=>{
  const users=[],events=[];let browser,eventId,token,guestId,design,revision=0,photos,foreignPhoto
  try{
    for(const role of ['owner','manager','invitations','content','moderator','checkin','viewer','outsider']){const sdk=client(),account=await checked(sdk.auth.signUp({email:`jotopa-info-${randomUUID()}@example.test`,password:`Information42-${randomUUID()}`,options:{data:{full_name:`Information fixture ${role}`}}}));users.push({sdk,id:account.user.id,role})}
    const owner=users[0].sdk,foreign=users[7].sdk
    const create=async sdk=>{const id=await checked(sdk.rpc('create_event',{p_title:'Information test',p_slug:`info-${randomUUID()}`,p_type:'wedding',p_starts_at:new Date(Date.now()+10*86400000).toISOString(),p_timezone:'America/Asuncion'}));events.push({id,sdk});sql(`update public.events set status='active',session_opens_at=now()-interval '1 day',session_closes_at=now()+interval '15 days' where id='${id}';`);return id}
    eventId=await create(owner);const foreignId=await create(foreign)
    for(const user of users.slice(1,7))sql(`insert into public.event_members(event_id,user_id,role) values('${eventId}','${user.id}','${user.role}');`)
    guestId=await checked(owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Invited person',companions_allowed:1,contact_consent:true}}));token=await checked(owner.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestId}))
    browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage(),images=await webpFixtures(page)
    photos=[];for(let index=0;index<3;index++)photos.push((await checked(uploadFixture(owner,eventId,images,`Information photo ${index}`))).id)
    foreignPhoto=(await checked(uploadFixture(foreign,foreignId,images))).id
    const save=async value=>{revision=await checked(owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:value,p_expected_revision:revision}));return revision}
    const publish=()=>checked(owner.rpc('publish_invitation_design',{p_event_id:eventId,p_expected_revision:revision}))
    const read=()=>checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read'}}))
    await suite.test('legacy published designs remain intact while the new information is a draft',async()=>{
      const legacy={...designFixture('Legacy published event'),cover_asset_id:photos[0]};await save(legacy);await publish()
      design=informationFixture(...photos);await save(design)
      const data=await read();assert.equal(data.presentation.version,1);assert.equal(data.presentation.names,legacy.names)
      const row=await checked(owner.from('event_invitation_designs').select('draft,published').eq('event_id',eventId).single());assert.equal(row.draft.version,2);assert.equal(row.published.version,1)
    })
    await suite.test('server independently validates external links, maps, banking, phone plans and data limits',async()=>{
      const invalid=[{...design,gifts:{...design.gifts,items:[{...design.gifts.items[0],url:'javascript:alert(1)'}]}},{...design,lodging:[{...design.lodging[0],booking_url:'http://example.com'}]},{...design,schedule:[{...design.schedule[0],google_maps_url:'https://google.com.evil.test/maps'}]},{...design,schedule:[{...design.schedule[0],google_maps_url:'https://www.google.com/maps/../not-maps'}]},{...design,schedule:[{...design.schedule[0],waze_url:'https://user:pass@waze.com/ul'}]},{...design,lodging:[{...design.lodging[0],phone:'0981123456'}]},{...design,lodging:[{...design.lodging[0],phone:'+595123'}]},{...design,lodging:[{...design.lodging[0],latitude:null}]},{...design,gifts:{...design.gifts,banking:{...design.gifts.banking,enabled:true,holder:'',account:'',alias:''}}},{...design,gifts:{...design.gifts,items:[design.gifts.items[0],design.gifts.items[0]]}},{...design,lodging:Array(7).fill(design.lodging[0])}]
      for(const value of invalid)assert.ok((await owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:value,p_expected_revision:revision})).error)
      for(const music_url of ['javascript:alert(1)','http://example.com/song.mp3','https://youtube.com/watch?v=1'])assert.ok((await owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:{...design,music_url},p_expected_revision:revision})).error)
      for(const value of [{...design,dress_photo_asset_id:foreignPhoto},{...design,schedule:[{...design.schedule[0],photo_asset_id:foreignPhoto}]},{...design,lodging:[{...design.lodging[0],photo_asset_id:foreignPhoto}]}])assert.equal((await owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:value,p_expected_revision:revision})).error?.message,'asset_unavailable')
    })
    await suite.test('all seven roles and an outsider keep their existing editor and publication permissions',async()=>{
      for(const user of users){const allowed=['owner','manager','content'].includes(user.role),result=await user.sdk.rpc('save_invitation_design',{p_event_id:eventId,p_design:design,p_expected_revision:revision});assert.equal(Boolean(result.error),!allowed,user.role);if(allowed)revision=result.data
        const rows=await checked(user.sdk.from('event_invitation_designs').select('draft').eq('event_id',eventId));assert.equal(rows.length,allowed?1:0,user.role)
        if(!['owner','manager'].includes(user.role))assert.ok((await user.sdk.rpc('publish_invitation_design',{p_event_id:eventId,p_expected_revision:revision})).error)
        assert.ok((await user.sdk.from('event_invitation_designs').update({published:design}).eq('event_id',eventId)).error)
      }
    })
    await suite.test('public JSON and signed manifests exclude hidden content and non-authorized banking fields',async()=>{
      await publish();const snapshot=await read(),published=snapshot.presentation
      assert.equal(published.version,2);assert.equal(published.schedule.length,1);assert.equal(published.lodging.length,1);assert.equal(published.gifts.items.length,1)
      for(const value of ['HIDDEN','PRIVATE BANK','PRIVATE HOLDER','PRIVATE ACCOUNT','PRIVATE ALIAS','PRIVATE NOTES'])assert.ok(!JSON.stringify(snapshot).includes(value))
      const signed=await checked(client().functions.invoke('invitation-assets',{body:{action:'sign',token}}));assert.deepEqual(new Set(signed.assets.map(asset=>asset.id)),new Set(photos.slice(0,2)))
      assert.ok(!JSON.stringify(signed).includes(token));assert.ok(!signed.assets.some(asset=>asset.id===photos[2]||asset.id===foreignPhoto))
    })
    await suite.test('banking requires both explicit publication and an active gift section',async()=>{
      design={...design,gifts:{...design.gifts,banking:{...design.gifts.banking,enabled:true}}};await save(design);await publish();assert.equal((await read()).presentation.gifts.banking.alias,'PRIVATE ALIAS')
      const changed={...design,gifts:{...design.gifts,banking:{...design.gifts.banking,alias:'DRAFT ALIAS'}}};await save(changed);assert.equal((await read()).presentation.gifts.banking.alias,'PRIVATE ALIAS')
      design={...changed,sections:changed.sections.map(section=>section.id==='gifts'?{...section,enabled:false}:section)};await save(design);await publish();const snapshot=await read();assert.equal(snapshot.presentation.gifts.banking.enabled,false);assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));assert.ok(!JSON.stringify(snapshot).includes('DRAFT ALIAS'))
    })
    await suite.test('item ordering, optional sections and all image references follow the published version',async()=>{
      design={...design,lodging:design.lodging.map(item=>({...item,enabled:true})).reverse(),schedule:design.schedule.map(item=>({...item,enabled:true})).reverse()};await save(design);await publish();let data=await read();assert.equal(data.presentation.lodging[0].id,design.lodging[0].id);assert.equal(data.presentation.schedule[0].id,design.schedule[0].id)
      assert.ok((await owner.functions.invoke('invitation-assets',{body:{action:'remove',event_id:eventId,asset_id:photos[2]}})).error)
      design={...design,sections:design.sections.map(section=>['schedule','lodging','dress','gallery'].includes(section.id)?{...section,enabled:false}:section)};await save(design);await publish();data=await read();assert.equal(data.presentation.lodging.length,0);assert.equal(data.presentation.schedule.length,0);assert.equal(data.presentation.dress_photo_asset_id,null)
      const signed=await checked(client().functions.invoke('invitation-assets',{body:{action:'sign',token}}));assert.deepEqual(signed.assets.map(asset=>asset.id),[photos[0]])
    })
    await suite.test('token isolation, temporal restrictions, RSVP and invitation history remain operative',async()=>{
      assert.equal((await checked(client().rpc('guest_invitation',{p_token:'0'.repeat(64),p_request:{action:'read'}}))).ok,false)
      const visit=randomUUID(),snapshot=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read',visit_id:visit}}))
      const response=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'respond',response:'yes',companions:1,expected_version:snapshot.guest.version}}));assert.equal(response.guest.companions_confirmed,1);assert.equal(response.presentation.version,2)
      const tracking=await checked(owner.rpc('get_guest_invitation_tracking',{p_event_id:eventId,p_guest_ids:[guestId]}));assert.equal(tracking[0].status,'responded');assert.equal(tracking[0].open_count,1)
      const audit=await checked(owner.from('audit_log').select('meta').eq('event_id',eventId));assert.ok(!JSON.stringify(audit).includes(token));assert.ok(!JSON.stringify(audit).includes('PRIVATE ALIAS'))
      sql(`update public.events set session_closes_at=now()-interval '1 second' where id='${eventId}';`);assert.equal((await read()).ok,false);assert.ok((await client().functions.invoke('invitation-assets',{body:{action:'sign',token}})).error)
    })
  }finally{await browser?.close();for(const event of events)await cleanupDesign(event.sdk,event.id);removeTestUsers(users.map(user=>user.id))}
})
