import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium} from '@playwright/test'
import {client,sql,removeTestUsers,apiUrl} from './local-test-helpers.mjs'
import {webpFixtures} from './design-test-helpers.mjs'
import {checked,wall,beginWall,textWall,resetWallLimits,wallPhotoForm,wallAudioForm,cleanupWall} from './wall-test-helpers.mjs'
import {encodeWav} from '../src/features/wall/wav.ts'

test('stage C: real bearer dedications, private multimedia and moderation',async suite=>{
  const users=[],events=[],guests=[];const anonymous=client();let browser,eventId,otherId,photos,combined
  try{
    for(const role of ['owner','manager','invitations','content','moderator','checkin','viewer','outsider']){const sdk=client(),signup=await checked(sdk.auth.signUp({email:`jotopa-wall-${randomUUID()}@example.test`,password:`Wall42-${randomUUID()}`}));users.push({sdk,id:signup.user.id,role})}
    const owner=users[0].sdk,moderator=users[4].sdk
    for(const sdk of [owner,users[7].sdk]){const id=await checked(sdk.rpc('create_event',{p_title:'Buenos deseos de prueba',p_slug:`wall-${randomUUID()}`,p_type:'wedding',p_starts_at:new Date(Date.now()+10*86400000).toISOString()}));events.push(id);sql(`update public.events set status='active',rsvp_deadline=now()-interval '1 hour' where id='${id}';`)}
    [eventId,otherId]=events
    for(const user of users.slice(1,7))sql(`insert into public.event_members(event_id,user_id,role) values('${eventId}','${user.id}','${user.role}');`)
    const create=async(size=1,name='Invitación de prueba',event=eventId,sdk=owner)=>{const id=await checked(sdk.rpc('save_guest',{p_event_id:event,p_data:{full_name:name,party_size:size,email:`wall-private-${randomUUID()}@example.test`}}));const token=await checked(sdk.rpc('get_guest_invitation_token',{p_event_id:event,p_guest_id:id}));const result={id,token};guests.push(result);return result}
    const individual=await create(),family=await create(5,'Familia de prueba'),other=await create(1,'Otra invitación',otherId,users[7].sdk)
    browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();photos=await webpFixtures(page)
    await suite.test('text is accepted before any RSVP and after RSVP expires; a declined guest can participate',async()=>{
      const pending=await wall(individual.token);assert.equal(pending.can_post,true)
      const snapshot=await checked(anonymous.rpc('guest_invitation',{p_token:individual.token}));assert.equal(snapshot.can_respond,false);assert.equal(snapshot.guest.rsvp_status,'pending')
      const post=await textWall(individual.token,'Un abrazo desde el primer acceso');assert.equal(post.ok,true)
      sql(`update public.guests set rsvp_status='no',companions_confirmed=0 where id='${family.id}';`)
      const no=await textWall(family.token,'Aunque no pueda ir, les deseo todo lo lindo',{participant_name:'Ana, acompañante'});assert.equal(no.ok,true)
      const stored=await checked(owner.from('wall_posts').select('author_name,participant_name,status,guest_id').eq('id',no.post_id).single());assert.equal(stored.author_name,'Familia de prueba');assert.equal(stored.participant_name,'Ana, acompañante');assert.equal(stored.guest_id,family.id);assert.equal(stored.status,'pending')
      assert.equal((await wall(individual.token)).posts.length,0)
      assert.equal((await beginWall(individual.token,'Forged',{author_name:'Otro titular'})).code,'invalid_request')
      assert.equal((await beginWall(individual.token,'Forged',{participant_name:'Un acompañante'})).code,'invalid_request')
    })
    await suite.test('new tables enforce all seven roles, outsider isolation, no direct writes or forged readiness',async()=>{
      for(const user of users){const allowed=['owner','manager','moderator'].includes(user.role);const rows=await checked(user.sdk.from('wall_posts').select('*').eq('event_id',eventId));assert.equal(rows.length,allowed?2:0)
        const configured=await user.sdk.rpc('configure_event_wall',{p_event_id:eventId,p_enabled:true,p_opens_at:null,p_closes_at:null,p_audio_max_seconds:30});assert.equal(Boolean(configured.error),!['owner','manager'].includes(user.role))
        if(allowed)await checked(user.sdk.rpc('moderate_wall_post',{p_post_id:rows[0].id,p_status:'approved'}));else assert.ok((await user.sdk.rpc('moderate_wall_post',{p_post_id:randomUUID(),p_status:'approved'})).error)
        assert.ok((await user.sdk.from('wall_posts').insert({event_id:eventId,guest_id:individual.id,author_name:'Spoof',request_id:randomUUID(),request_hash:'spoof'})).error)
        assert.ok((await user.sdk.rpc('complete_wall_media',{p_media_id:randomUUID()})).error)
        assert.equal((await checked(user.sdk.from('guests').select('email').eq('event_id',eventId))).length,['owner','manager','invitations'].includes(user.role)?2:0)
      }
      for(const table of ['wall_posts','wall_post_media','event_wall_settings'])assert.ok((await anonymous.from(table).select('*')).error)
      assert.ok((await anonymous.rpc('finish_wall_purge',{p_post_id:randomUUID()})).error)
    })
    await suite.test('photo and voice are checked by the live Edge function and submitted atomically as one pending post',async()=>{
      resetWallLimits(family.id)
      combined=await beginWall(family.token,'Una foto, unas palabras y nuestra voz',{photo_count:1,audio_count:1});assert.equal(combined.ok,true)
      assert.equal((await wall(family.token,{action:'submit',post_id:combined.post_id})).code,'media_incomplete')
      const wav=encodeWav(new Float32Array(32000).map((_,i)=>Math.sin(i*.1)*.15))
      const uploaded=await Promise.all([anonymous.functions.invoke('wall-media',{body:wallPhotoForm(family.token,combined.post_id,photos)}),anonymous.functions.invoke('wall-media',{body:wallPhotoForm(family.token,combined.post_id,photos)}),anonymous.functions.invoke('wall-media',{body:wallAudioForm(family.token,combined.post_id,wav)})]);for(const result of uploaded)assert.equal(result.error,null)
      await checked(anonymous.functions.invoke('wall-media',{body:wallPhotoForm(family.token,combined.post_id,photos)}))
      const media=await checked(owner.from('wall_post_media').select('*').eq('post_id',combined.post_id));assert.equal(media.length,2);assert.equal(media.find(item=>item.kind==='audio').duration_seconds,2)
      assert.equal((await wall(family.token,{action:'submit',post_id:combined.post_id})).status,'pending');assert.equal((await wall(family.token,{action:'submit',post_id:combined.post_id})).status,'pending')
      assert.equal((await wall(family.token)).posts.some(post=>post.id===combined.post_id),false)
    })
    await suite.test('pending media is private, only moderators can sign it, and cross-event paths remain inaccessible',async()=>{
      const media=await checked(owner.from('wall_post_media').select('*').eq('post_id',combined.post_id));const photo=media.find(item=>item.kind==='photo'),path=`${eventId}/${photo.id}/small.webp`
      for(const sdk of [anonymous,users[2].sdk,users[3].sdk,users[7].sdk]){const result=await sdk.storage.from('wall-media').createSignedUrl(path,60);assert.ok(result.error)}
      const signed=await checked(moderator.storage.from('wall-media').createSignedUrl(path,60));assert.equal((await fetch(signed.signedUrl)).status,200)
      assert.notEqual((await fetch(`${apiUrl}/storage/v1/object/public/wall-media/${path}`)).status,200)
      const publicResult=await checked(anonymous.functions.invoke('wall-media',{body:{action:'sign',token:family.token,post_ids:[combined.post_id]}}));assert.equal(publicResult.media.length,0)
      const manifest=await wall(other.token,{action:'manifest',post_ids:[combined.post_id]});assert.equal(manifest.media.length,0)
      assert.ok((await anonymous.storage.from('wall-media').upload(`${eventId}/${randomUUID()}/large.webp`,new Blob([photos.large],{type:'image/webp'}))).error)
      for(const sdk of [anonymous,users[2].sdk,users[7].sdk])assert.ok((await sdk.functions.invoke('wall-media',{body:{action:'purge',post_id:combined.post_id}})).error)
    })
    await suite.test('approval exposes safe chat projections and short signed URLs; rejection and hiding revoke future access',async()=>{
      await checked(moderator.rpc('moderate_wall_post',{p_post_id:combined.post_id,p_status:'approved'}))
      resetWallLimits(family.id);const list=await wall(family.token),post=list.posts.find(item=>item.id===combined.post_id);assert.ok(post);assert.equal('guest_id'in post,false);assert.equal('email'in post,false);assert.equal(post.media.length,2)
      const signed=await checked(anonymous.functions.invoke('wall-media',{body:{action:'sign',token:family.token,post_ids:[combined.post_id]}}));assert.equal(signed.media.length,2)
      for(const media of signed.media)for(const relative of media.urls){const address=new URL(relative,apiUrl);const claims=JSON.parse(Buffer.from(address.searchParams.get('token').split('.')[1],'base64url').toString());assert.ok(claims.exp*1000<=Date.now()+61000);assert.equal((await fetch(address)).status,200)}
      for(const status of ['hidden','rejected']){await checked(moderator.rpc('moderate_wall_post',{p_post_id:combined.post_id,p_status:status}));assert.equal((await wall(family.token)).posts.some(item=>item.id===combined.post_id),false);assert.equal((await wall(family.token,{action:'manifest',post_ids:[combined.post_id]})).media.length,0)}
      await checked(moderator.rpc('moderate_wall_post',{p_post_id:combined.post_id,p_status:'approved'}))
    })
    await suite.test('personal token checks prevent another invitation from uploading or submitting an existing draft',async()=>{
      const fresh=await create(2),draft=await beginWall(fresh.token,'Only this invitation',{photo_count:1});assert.equal(draft.ok,true)
      for(const action of ['submit','cancel'])assert.equal((await wall(other.token,{action,post_id:draft.post_id})).code,'post_unavailable')
      assert.ok((await anonymous.functions.invoke('wall-media',{body:wallPhotoForm(other.token,draft.post_id,photos)})).error)
      for(const token of ['bad','f'.repeat(64),fresh.token.slice(0,63)+(fresh.token.endsWith('a')?'b':'a')])assert.equal((await wall(token)).code,'invitation_unavailable')
      await checked(owner.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:fresh.id,p_rotate:true}));assert.equal((await wall(fresh.token)).code,'invitation_unavailable')
    })
    await suite.test('dedication settings suspend or bound new posts independently; the event access window remains authoritative',async()=>{
      const fresh=await create();const settings={p_event_id:eventId,p_enabled:true,p_opens_at:null,p_closes_at:null,p_audio_max_seconds:15}
      for(const patch of [{p_enabled:false},{p_opens_at:new Date(Date.now()+3600000).toISOString()},{p_closes_at:new Date(Date.now()-1000).toISOString()}]){await checked(owner.rpc('configure_event_wall',{...settings,...patch}));resetWallLimits(fresh.id);assert.equal((await wall(fresh.token)).can_post,false);assert.equal((await beginWall(fresh.token)).code,'wall_closed')}
      await checked(owner.rpc('configure_event_wall',settings));resetWallLimits(fresh.id);assert.equal((await wall(fresh.token)).can_post,true)
      sql(`update public.events set session_closes_at=now()-interval '1 second' where id='${eventId}';`);assert.equal((await wall(fresh.token)).code,'invitation_unavailable');sql(`update public.events set session_closes_at=now()+interval '20 days' where id='${eventId}';`)
      assert.ok((await owner.rpc('configure_event_wall',{...settings,p_audio_max_seconds:121})).error)
    })
    await suite.test('binary size, format, real duration and malformed attempts are checked and charged server-side',async()=>{
      const fresh=await create();const draft=await beginWall(fresh.token,'Audio validation',{audio_count:1,photo_count:1})
      for(const bytes of [new Uint8Array(100),encodeWav(new Float32Array(16000*16))])assert.ok((await anonymous.functions.invoke('wall-media',{body:wallAudioForm(fresh.token,draft.post_id,bytes)})).error)
      assert.ok((await anonymous.functions.invoke('wall-media',{body:wallPhotoForm(fresh.token,draft.post_id,{large:new Uint8Array(100),small:photos.small})})).error)
      assert.ok((await anonymous.functions.invoke('wall-media',{body:wallPhotoForm(fresh.token,draft.post_id,{large:new Uint8Array(1000001),small:photos.small})})).error)
      assert.ok((await anonymous.functions.invoke('wall-media',{body:wallAudioForm(fresh.token,draft.post_id,new Uint8Array(3850000))})).error)
      assert.equal((await wall(fresh.token,{action:'reserve',post_id:draft.post_id,kind:'photo',slot:0,fingerprint:'0'.repeat(64),byte_count:10})).code,'invalid_media')
      assert.equal((await checked(owner.from('wall_post_media').select('*').eq('post_id',draft.post_id))).length,0)
      const count=Number(sql(`select used from private.invitation_rate_limits where guest_id='${fresh.id}' and scope='wall_upload';`).trim());assert.ok(count>=4)
    })
    await suite.test('concurrent retries are idempotent; conflicting payloads, post and request quotas are enforced',async()=>{
      const fresh=await create(),request={action:'begin',body:'One immutable attempt',photo_count:0,audio_count:0,request_id:randomUUID()}
      const same=await Promise.all([wall(fresh.token,request),wall(fresh.token,request)]);assert.equal(same[0].post_id,same[1].post_id)
      assert.equal((await wall(fresh.token,{...request,body:'Another body'})).code,'request_conflict')
      resetWallLimits(fresh.id);await textWall(fresh.token,'Second');await textWall(fresh.token,'Third');assert.equal((await beginWall(fresh.token,'Fourth')).code,'post_limit')
      resetWallLimits(fresh.id);const results=await Promise.all(Array.from({length:10},()=>wall(fresh.token,{action:'unknown'})));assert.ok(results.some(result=>result.code==='rate_limited'))
      resetWallLimits(fresh.id);const checks=await Promise.all(Array.from({length:14},()=>checked(anonymous.rpc('check_wall_upload',{p_token:fresh.token,p_post_id:same[0].post_id}))));assert.equal(checks.filter(result=>result.code==='rate_limited').length,2)
    })
    await suite.test('chronological pagination preserves all approved history without other-event posts',async()=>{
      const fresh=await create();sql(`insert into public.wall_posts(event_id,guest_id,author_name,body,status,request_id,request_hash,created_at,submitted_at) select '${eventId}','${fresh.id}','History fixture','History '||i,'approved',gen_random_uuid(),'fixture',now()-interval '1 day'+i*interval '1 second',now() from generate_series(1,31)i;`)
      resetWallLimits(fresh.id);const first=await wall(fresh.token);assert.equal(first.posts.length,25);assert.equal(first.has_more,true);const second=await wall(fresh.token,{action:'list',after_id:first.posts.at(-1).id});const ids=[...first.posts,...second.posts].map(post=>post.id);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.length>=32);assert.equal((await wall(other.token)).posts.length,0)
      assert.equal((await wall(fresh.token,{action:'list',after_id:randomUUID()})).code,'refresh_required')
    })
    await suite.test('a setting changed after upload is rechecked on submit and abandoned files can be cancelled safely',async()=>{
      const fresh=await create(2),settings={p_event_id:eventId,p_enabled:true,p_opens_at:null,p_closes_at:null,p_audio_max_seconds:30}
      await checked(owner.rpc('configure_event_wall',settings));const draft=await beginWall(fresh.token,'Audio-only boundary',{audio_count:1})
      assert.ok((await moderator.rpc('moderate_wall_post',{p_post_id:draft.post_id,p_status:'approved'})).error)
      await checked(anonymous.functions.invoke('wall-media',{body:wallAudioForm(fresh.token,draft.post_id,encodeWav(new Float32Array(16000*20)))}))
      await checked(owner.rpc('configure_event_wall',{...settings,p_audio_max_seconds:15}));assert.equal((await wall(fresh.token,{action:'submit',post_id:draft.post_id})).code,'media_incomplete')
      await checked(owner.rpc('configure_event_wall',settings));assert.equal((await wall(fresh.token,{action:'submit',post_id:draft.post_id})).status,'pending')
      const photoDraft=await beginWall(fresh.token,'Photo-only boundary',{photo_count:1});await checked(anonymous.functions.invoke('wall-media',{body:wallPhotoForm(fresh.token,photoDraft.post_id,photos)}))
      await checked(anonymous.functions.invoke('wall-media',{body:{action:'cancel',token:fresh.token,post_id:photoDraft.post_id}}))
      const media=await checked(owner.from('wall_post_media').select('state,id').eq('post_id',photoDraft.post_id).single());assert.equal(media.state,'deleted');assert.notEqual((await owner.storage.from('wall-media').download(`${eventId}/${media.id}/large.webp`)).error,null)
      assert.equal((await beginWall(fresh.token,'Invalid',{photo_count:4})).code,'invalid_request')
    })
    await suite.test('audit is immutable, omits bodies, tokens and contacts; deleting files revokes even issued URLs',async()=>{
      resetWallLimits(family.id);const signed=await checked(anonymous.functions.invoke('wall-media',{body:{action:'sign',token:family.token,post_ids:[combined.post_id]}}));const oldUrl=new URL(signed.media[0].urls[0],apiUrl)
      await checked(moderator.functions.invoke('wall-media',{body:{action:'purge',post_id:combined.post_id}}));assert.notEqual((await fetch(oldUrl)).status,200);assert.equal((await checked(owner.from('wall_posts').select('body,status').eq('id',combined.post_id).single())).status,'deleted')
      const audit=await checked(owner.from('audit_log').select('action,meta').eq('event_id',eventId).like('action','wall.%'));for(const action of ['wall.submitted','wall.moderated','wall.deleted','wall.settings_updated'])assert.ok(audit.some(row=>row.action===action))
      const serialized=JSON.stringify(audit);for(const guest of guests)assert.equal(serialized.includes(guest.token),false);assert.equal(serialized.includes('Una foto, unas palabras'),false);assert.equal(serialized.includes('wall-private-'),false)
      assert.ok((await moderator.from('audit_log').insert({event_id:eventId,action:'wall.spoof'})).error)
      const tracking=await checked(owner.from('invitations').select('open_count').eq('event_id',eventId));assert.equal(tracking.reduce((sum,row)=>sum+row.open_count,0),0)
    })
  }finally{
    await browser?.close()
    for(const id of events){const sdk=id===eventId?users[0].sdk:users[7].sdk;await cleanupWall(sdk,id);sql(`delete from public.events where id='${id}';`)}
    removeTestUsers(users.map(user=>user.id))
  }
})
