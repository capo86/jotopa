import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium} from '@playwright/test'
import {client,sql,removeTestUsers} from './local-test-helpers.mjs'
import {designFixture,webpFixtures,uploadFixture,cleanupDesign} from './design-test-helpers.mjs'

const checked=async promise=>{const result=await promise;if(result.error)throw new Error(`Local design request failed (${result.error.code??'request'})`);return result.data}
test('visual designs, secure image storage, publication and existing personal capabilities',async suite=>{
  const users=[],events=[],roles=['owner','manager','invitations','content','moderator','checkin','viewer','outsider']
  let browser,eventId,otherId,guestId,token,otherToken,photo,galleryPhoto,foreignPhoto,revision=0,design
  try{
    for(const role of roles){const sdk=client(),account=await checked(sdk.auth.signUp({email:`jotopa-design-${randomUUID()}@example.test`,password:`DesignSecure42-${randomUUID()}`,options:{data:{full_name:`Design test ${role}`}}}));users.push({role,sdk,id:account.user.id})}
    const owner=users[0].sdk,outsider=users[7].sdk
    const create=async(sdk)=>{const id=await checked(sdk.rpc('create_event',{p_title:'Local visual design test',p_slug:`design-${randomUUID()}`,p_type:'wedding',p_starts_at:new Date(Date.now()+10*86400000).toISOString(),p_timezone:'America/Asuncion'}));events.push({id,sdk});sql(`update public.events set status='active',session_opens_at=now()-interval '1 day',session_closes_at=now()+interval '15 days' where id='${id}';`);return id}
    eventId=await create(owner);otherId=await create(outsider)
    for(const user of users.slice(1,7))sql(`insert into public.event_members(event_id,user_id,role) values('${eventId}','${user.id}','${user.role}');`)
    guestId=await checked(owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Personal guest',companions_allowed:1,contact_consent:true}}))
    const otherGuest=await checked(outsider.rpc('save_guest',{p_event_id:otherId,p_data:{full_name:'Other event guest'}}))
    token=await checked(owner.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestId}));otherToken=await checked(outsider.rpc('get_guest_invitation_token',{p_event_id:otherId,p_guest_id:otherGuest}))
    design=designFixture()
    await suite.test('seven roles and outsiders cannot bypass editor RLS or publish privileges',async()=>{
      for(const user of users){
        const allowed=['owner','manager','content'].includes(user.role)
        const result=await user.sdk.rpc('save_invitation_design',{p_event_id:eventId,p_design:design,p_expected_revision:revision})
        assert.equal(Boolean(result.error),!allowed,user.role)
        if(allowed)revision=result.data
        const rows=await checked(user.sdk.from('event_invitation_designs').select('event_id').eq('event_id',eventId));assert.equal(rows.length,allowed?1:0,user.role)
        assert.ok((await user.sdk.from('event_invitation_designs').update({published:design}).eq('event_id',eventId)).error)
        assert.ok((await user.sdk.rpc('complete_invitation_asset',{p_asset_id:randomUUID(),p_width:100,p_height:100,p_bytes:100})).error)
        if(!['owner','manager'].includes(user.role))assert.ok((await user.sdk.rpc('publish_invitation_design',{p_event_id:eventId,p_expected_revision:revision})).error)
      }
      assert.ok((await client().from('event_invitation_designs').select('*')).error)
      const publicRead=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read'}}));assert.equal(publicRead.presentation,null)
    })
    browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();const images=await webpFixtures(page)
    await suite.test('real Edge upload validates bytes, authentication and private storage access',async()=>{
      photo=(await checked(uploadFixture(owner,eventId,images))).id
      galleryPhoto=(await checked(uploadFixture(owner,eventId,images))).id
      foreignPhoto=(await checked(uploadFixture(outsider,otherId,images))).id
      assert.ok((await uploadFixture(client(),eventId,images)).error)
      assert.ok((await uploadFixture(users[2].sdk,eventId,images)).error)
      assert.ok((await uploadFixture(owner,eventId,{large:Buffer.from('<html>invalid</html>'),small:images.small})).error)
      const image=await checked(owner.from('event_invitation_assets').select('*').eq('id',photo).single())
      assert.equal(image.status,'ready');assert.ok(image.width<=1920&&image.height<=1920);assert.ok(image.bytes<=2_000_000)
      const path=`${eventId}/${photo}/large.webp`
      assert.ok((await client().storage.from('event-assets').download(path)).error)
      assert.ok((await outsider.storage.from('event-assets').createSignedUrl(path,60)).error)
      assert.ok((await owner.storage.from('event-assets').upload(`${eventId}/${randomUUID()}/large.webp`,images.large,{contentType:'image/webp'})).error)
      const signed=await checked(owner.storage.from('event-assets').createSignedUrl(path,60));assert.equal((await fetch(signed.signedUrl)).status,200)
    })
    await suite.test('SQL independently rejects invalid designs and binds every selected asset to its event',async()=>{
      const moment={id:randomUUID(),label:'Arrival',venue:'Venue',address:'Asuncion',starts_at:new Date(Date.now()+86400000).toISOString(),latitude:null,longitude:null}
      revision=await checked(owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:{...design,names:'🌿'.repeat(80)},p_expected_revision:revision}))
      for(const invalid of [{...design,names:'🌿'.repeat(81)},{...design,schedule:[{...moment,id:'-'.repeat(36)}]},{...design,schedule:[{...moment,starts_at:'2026-11-22T24:00:00Z'}]},{...design,schedule:[moment,moment]},{...design,schedule:[{...moment,latitude:10}]}])assert.ok((await owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:invalid,p_expected_revision:revision})).error)
      for(const invalid of [{...design,template:null},{...design,version:2},{...design,unknown:true},{...design,palette:'#ffffff'},{...design,names:'a'.repeat(64)},{...design,sections:design.sections.slice(1)},{...design,cover_asset_id:foreignPhoto},{...design,gallery:[{asset_id:foreignPhoto,caption:''}]}])assert.ok((await owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:invalid,p_expected_revision:revision})).error)
      design={...design,cover_asset_id:photo,gallery:[{asset_id:galleryPhoto,caption:'Local photograph'}]}
      revision=await checked(owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:design,p_expected_revision:revision}))
      assert.ok((await owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:design,p_expected_revision:revision-1})).error)
      await checked(users[1].sdk.rpc('publish_invitation_design',{p_event_id:eventId,p_expected_revision:revision}))
      const snapshot=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read'}}));assert.equal(snapshot.presentation.cover_asset_id,photo)
      const changed={...design,names:'UNPUBLISHED DRAFT',sections:design.sections.map(section=>({...section,enabled:false}))}
      revision=await checked(users[3].sdk.rpc('save_invitation_design',{p_event_id:eventId,p_design:changed,p_expected_revision:revision}))
      assert.equal((await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read'}}))).presentation.names,design.names)
    })
    await suite.test('public signing is limited to published event assets and valid time-bound capabilities',async()=>{
      const result=await checked(client().functions.invoke('invitation-assets',{body:{action:'sign',token}}));assert.equal(result.assets.length,2);assert.ok(result.assets.some(asset=>asset.id===photo));assert.ok(!JSON.stringify(result).includes(token))
      assert.ok(!result.assets.some(asset=>asset.id===foreignPhoto))
      const signed=await fetch(new URL(result.assets[0].small,'http://127.0.0.1:54321'));assert.equal(signed.status,200);assert.equal(signed.headers.get('content-type'),'image/webp')
      assert.ok((await client().functions.invoke('invitation-assets',{body:{action:'sign',token:'0'.repeat(64)}})).error)
      assert.ok((await client().functions.invoke('invitation-assets',{body:{action:'sign',token,asset_id:foreignPhoto}})).error)
      assert.equal((await checked(client().functions.invoke('invitation-assets',{body:{action:'sign',token:otherToken}}))).assets.length,0)
      sql(`update public.events set session_closes_at=now()+interval '8 seconds' where id='${eventId}';`)
      const short=await checked(client().functions.invoke('invitation-assets',{body:{action:'sign',token}}))
      const credential=new URL(short.assets[0].small,'http://127.0.0.1:54321').searchParams.get('token')
      const claims=JSON.parse(Buffer.from(credential.split('.')[1],'base64url').toString())
      assert.ok(claims.exp*1000<=Date.now()+8000)
      sql(`update public.events set session_closes_at=now()-interval '1 second' where id='${eventId}';`)
      assert.ok((await client().functions.invoke('invitation-assets',{body:{action:'sign',token}})).error)
      sql(`update public.events set session_closes_at=now()+interval '15 days' where id='${eventId}';`)
    })
    await suite.test('existing opening deduplication, RSVP bounds and immutable history survive publication',async()=>{
      const visit=randomUUID()
      const read=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read',visit_id:visit}}))
      await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read',visit_id:visit}}))
      const invalid=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'respond',response:'yes',companions:2,expected_version:read.guest.version}}));assert.equal(invalid.code,'invalid_companions')
      const yes=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'respond',response:'yes',companions:1,expected_version:read.guest.version}}));assert.equal(yes.guest.companions_confirmed,1);assert.equal(yes.presentation.names,design.names)
      const tracking=await checked(owner.rpc('get_guest_invitation_tracking',{p_event_id:eventId,p_guest_ids:[guestId]}));assert.equal(tracking[0].open_count,1);assert.equal(tracking[0].status,'responded')
      const history=await checked(owner.rpc('get_guest_invitation_history',{p_event_id:eventId,p_guest_id:guestId}));assert.equal(history.rows.filter(row=>row.type==='opened').length,1);assert.equal(history.rows.filter(row=>row.type==='rsvp').length,1)
      const audit=await checked(owner.from('audit_log').select('meta').eq('event_id',eventId));assert.ok(!JSON.stringify(audit).includes(token));assert.ok(!JSON.stringify(audit).includes(design.welcome))
    })
    await suite.test('disabled sections are absent from public content and signed image manifests',async()=>{
      const hidden={...design,welcome:'HIDDEN WELCOME',details:'HIDDEN DETAILS',dress_code:'HIDDEN DRESS',closing:'HIDDEN CLOSING',sections:design.sections.map(section=>({...section,enabled:!['gallery','welcome','details','dress','closing'].includes(section.id)}))}
      revision=await checked(owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:hidden,p_expected_revision:revision}));await checked(owner.rpc('publish_invitation_design',{p_event_id:eventId,p_expected_revision:revision}))
      const publicRead=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read'}}))
      for(const field of ['welcome','details','dress_code','closing'])assert.equal(publicRead.presentation[field],'')
      assert.equal(publicRead.presentation.gallery.length,0)
      const signed=await checked(client().functions.invoke('invitation-assets',{body:{action:'sign',token}}));assert.equal(signed.assets.length,1);assert.equal(signed.assets[0].id,photo)
    })
    await suite.test('concurrent saves preserve one version and publication/removal remain controlled',async()=>{
      const current=await checked(owner.from('event_invitation_designs').select('draft,revision').eq('event_id',eventId).single())
      const results=await Promise.all([owner.rpc('save_invitation_design',{p_event_id:eventId,p_design:current.draft,p_expected_revision:current.revision}),users[3].sdk.rpc('save_invitation_design',{p_event_id:eventId,p_design:current.draft,p_expected_revision:current.revision})]);assert.equal(results.filter(result=>!result.error).length,1)
      assert.ok((await owner.functions.invoke('invitation-assets',{body:{action:'remove',event_id:eventId,asset_id:photo}})).error)
      await checked(owner.rpc('unpublish_invitation_design',{p_event_id:eventId}))
      assert.equal((await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read'}}))).presentation,null)
    })
    await suite.test('upload reservations enforce event capacity and actor quotas even after removal',async()=>{
      const currentAssets=await checked(owner.from('event_invitation_assets').select('id').eq('event_id',eventId).neq('status','deleted'))
      for(let index=currentAssets.length;index<20;index++)await checked(owner.rpc('reserve_invitation_asset',{p_event_id:eventId,p_alt:'Quota fixture'}))
      const full=await owner.rpc('reserve_invitation_asset',{p_event_id:eventId,p_alt:'Over capacity'});assert.equal(full.error?.message,'asset_limit')
      sql(`update public.event_invitation_assets set status='deleted' where event_id='${eventId}' and status='reserved';`)
      for(let index=0;index<10;index++)await checked(owner.rpc('reserve_invitation_asset',{p_event_id:eventId,p_alt:'Hourly quota fixture'}))
      const limited=await owner.rpc('reserve_invitation_asset',{p_event_id:eventId,p_alt:'Over hourly quota'});assert.equal(limited.error?.message,'upload_limit')
    })
  }finally{
    await browser?.close()
    for(const event of events)await cleanupDesign(event.sdk,event.id)
    removeTestUsers(users.map(user=>user.id))
  }
})
