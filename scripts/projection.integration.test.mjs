import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium} from '@playwright/test'
import {client,sql,removeTestUsers,apiUrl,publicKey} from './local-test-helpers.mjs'
import {checked,wall,textWall,beginWall,wallPhotoForm,wallAudioForm,resetWallLimits,cleanupWall} from './wall-test-helpers.mjs'
import {webpFixtures} from './design-test-helpers.mjs'
import {encodeWav} from '../src/features/wall/wav.ts'

const waitFor=async predicate=>{const start=Date.now();while(!predicate()&&Date.now()-start<7000)await new Promise(resolve=>setTimeout(resolve,50));assert.equal(Boolean(predicate()),true)}
async function subscribe(sdk,topic,received,privateChannel=true){return new Promise((resolve,reject)=>{let channel;const timer=setTimeout(()=>reject(new Error('Realtime did not subscribe')),10000);channel=sdk.channel(topic,{config:{private:privateChannel,broadcast:{ack:true}}}).on('broadcast',{event:'wall_changed'},event=>received.push(event.payload)).subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve(channel)}else if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(new Error('Realtime authorization rejected'))}})})}

test('stage D: real Realtime, safe incremental histories and read-only projection',async suite=>{
  const users=[],events=[],listeners=[];const anonymous=client();let browser,eventId,otherId,projection,slug,token,guestId,topic,mediaPost
  try{
    for(const role of ['owner','manager','invitations','content','moderator','checkin','viewer','outsider']){const sdk=client(),account=await checked(sdk.auth.signUp({email:`jotopa-projection-${randomUUID()}@example.test`,password:`Projection42-${randomUUID()}`}));users.push({sdk,id:account.user.id,role})}
    const owner=users[0].sdk,moderator=users[4].sdk
    for(const sdk of [owner,users[7].sdk]){const id=await checked(sdk.rpc('create_event',{p_title:'Un encuentro, muchas voces',p_slug:`projection-${randomUUID()}`,p_type:'wedding',p_starts_at:new Date(Date.now()+864000000).toISOString()}));events.push(id);sql(`update public.events set status='active',rsvp_deadline=now()-interval '1 hour' where id='${id}';`)}
    [eventId,otherId]=events;slug=(await checked(owner.from('events').select('slug').eq('id',eventId).single())).slug
    for(const user of users.slice(1,7))sql(`insert into public.event_members(event_id,user_id,role) values('${eventId}','${user.id}','${user.role}');`)
    guestId=await checked(owner.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Familia de la proyección',party_size:3}}));token=await checked(owner.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestId}))
    const sync=(after=0,snapshot)=>checked(anonymous.rpc('sync_guest_wall',{p_token:token,p_after_revision:after,...(snapshot!==undefined?{p_snapshot_revision:snapshot}:{})}))
    const screen=(request={action:'sync'},access=projection?.access,eventSlug=slug)=>checked(anonymous.rpc('projection_wall',{p_slug:eventSlug,p_access:access,p_request:request}))
    const reset=()=>{resetWallLimits(guestId);sql(`delete from private.invitation_rate_limits where scope='projection_read' and bucket='${eventId}';`)}
    await suite.test('seven roles enforce projection issue/revoke and hashed credentials stay server-side',async()=>{
      for(const user of users){const allowed=['owner','manager','moderator'].includes(user.role);const response=await user.sdk.rpc('issue_wall_projection_access',{p_event_id:eventId});assert.equal(Boolean(response.error),!allowed)
        const state=await user.sdk.rpc('get_wall_projection_status',{p_event_id:eventId});assert.equal(Boolean(state.error),!allowed)
        if(allowed){assert.equal(/^[a-f0-9]{64}$/.test(response.data.access),true);await checked(user.sdk.rpc('revoke_wall_projection_access',{p_event_id:eventId}))}else assert.ok((await user.sdk.rpc('revoke_wall_projection_access',{p_event_id:eventId})).error)
      }
      projection=await checked(owner.rpc('issue_wall_projection_access',{p_event_id:eventId}));assert.equal(Number(sql(`select count(*) from private.wall_projection_access where event_id='${eventId}' and octet_length(token_hash)=32;`).trim()),1)
      assert.throws(()=>sql(`set role anon;select * from private.wall_projection_access;`));assert.throws(()=>sql(`set role authenticated;select * from private.wall_projection_access;`))
      assert.equal(JSON.stringify(await checked(owner.rpc('get_wall_projection_status',{p_event_id:eventId}))).includes(projection.access),false)
    })
    await suite.test('real private channels authorize guests/moderators while rejecting guessed topics and outsider moderation',async()=>{
      reset();const initial=await sync();assert.equal(initial.ok,true);topic=initial.stream_topic
      const guestSdk=client(),hostSdk=moderator,guestSignals=[],hostSignals=[];listeners.push(guestSdk,hostSdk)
      await subscribe(guestSdk,topic,guestSignals);await subscribe(hostSdk,`wall-moderation:${eventId}`,hostSignals)
      const post=await textWall(token,'Aprobación en vivo');assert.equal(post.ok,true)
      await waitFor(()=>hostSignals.length>0);assert.equal(guestSignals.length,0)
      await checked(moderator.rpc('moderate_wall_post',{p_post_id:post.post_id,p_status:'approved'}));await waitFor(()=>guestSignals.length>0)
      for(const payload of [...guestSignals,...hostSignals]){assert.ok(Object.keys(payload).every(key=>key==='id'));assert.equal(JSON.stringify(payload).includes('Aprobación'),false)}
      const attacker=client();listeners.push(attacker);await assert.rejects(subscribe(attacker,'wall-approved:'+'0'.repeat(64),[]));await attacker.removeAllChannels()
      await assert.rejects(subscribe(users[7].sdk,`wall-moderation:${eventId}`,[]));await users[7].sdk.removeAllChannels()
    })
    await suite.test('clients cannot forge private broadcasts and the legitimate receiver remains intact',async()=>{
      const attacker=client(),received=[],recipient=client();listeners.push(attacker,recipient)
      await subscribe(recipient,topic,received);const channel=await subscribe(attacker,topic,[]);assert.equal(await channel.send({type:'broadcast',event:'wall_changed',payload:{forged:true}}),'error');await attacker.removeAllChannels()
      const publicChannel=await subscribe(attacker,topic,[],false);assert.equal(await publicChannel.send({type:'broadcast',event:'wall_changed',payload:{forged:true}}),'ok')
      const row=await checked(owner.from('wall_posts').select('id').eq('event_id',eventId).eq('status','approved').single());await checked(moderator.rpc('moderate_wall_post',{p_post_id:row.id,p_status:'hidden'}));await waitFor(()=>received.length>0);assert.equal(received.some(item=>item.forged),false)
      await attacker.removeAllChannels()
    })
    await suite.test('revision cursors add approved posts, remove hidden/rejected posts and never expose pending content',async()=>{
      reset();const first=await sync();assert.ok(first.changes.every(change=>change.post===null))
      const post=await textWall(token,'Un segundo recuerdo');const noPending=await sync(first.next_revision);assert.equal(noPending.changes.length,0)
      await checked(owner.rpc('moderate_wall_post',{p_post_id:post.post_id,p_status:'approved'}));const added=await sync(first.next_revision);assert.equal(added.changes.length,1);assert.equal(added.changes[0].post.body,'Un segundo recuerdo');assert.equal('guest_id'in added.changes[0].post,false)
      await checked(owner.rpc('moderate_wall_post',{p_post_id:post.post_id,p_status:'rejected'}));const removed=await sync(added.next_revision);assert.equal(removed.changes[0].post,null)
      const publicData=await screen();assert.equal(JSON.stringify(publicData).includes('Familia de la proyección'),false)
    })
    await suite.test('history paging and changes during a snapshot preserve every approved post without gaps',async()=>{
      reset();sql(`insert into public.wall_posts(event_id,guest_id,author_name,body,status,request_id,request_hash,created_at,submitted_at) select '${eventId}','${guestId}','Historia aprobada','Recuerdo '||i,'approved',gen_random_uuid(),'fixture',now()-interval '2 days'+i*interval '1 second',now() from generate_series(1,75)i;`)
      const first=await sync();assert.equal(first.has_more,true);assert.equal(first.changes.length,50)
      const last=await checked(owner.from('wall_posts').select('id').eq('event_id',eventId).eq('body','Recuerdo 75').single());await checked(owner.rpc('moderate_wall_post',{p_post_id:last.id,p_status:'hidden'}))
      const next=await sync(first.next_revision,first.snapshot_revision);const delta=await sync(next.next_revision)
      const all=[...first.changes,...next.changes,...delta.changes];const active=new Map();for(const change of all){if(change.post)active.set(change.id,change.post);else active.delete(change.id)}assert.equal(active.size,74);assert.equal(active.has(last.id),false)
      assert.equal((await sync(-1)).code,'refresh_required');assert.equal((await sync(Number.MAX_SAFE_INTEGER)).code,'refresh_required')
    })
    await suite.test('projection is read-only, event-bound and independent of RSVP, without contacts or administrative fields',async()=>{
      reset();const result=await screen();assert.equal(result.ok,true);assert.equal(result.event.slug,slug);assert.equal('created_by'in result.event,false)
      const serialized=JSON.stringify(result);assert.equal(serialized.includes(token),false);assert.equal(serialized.includes(projection.access),false);assert.equal(serialized.includes('phone'),false);assert.equal(serialized.includes('email'),false)
      assert.equal((await screen({action:'submit',post_id:randomUUID()})).code,'invalid_request');assert.equal((await screen({},projection.access,'not-this-event')).code,'projection_unavailable')
      assert.equal((await checked(anonymous.rpc('guest_wall',{p_token:projection.access,p_request:{action:'begin',body:'Forged author',photo_count:0,audio_count:0,request_id:randomUUID()}}))).code,'invitation_unavailable')
      assert.equal((await checked(anonymous.rpc('projection_wall',{p_slug:slug,p_access:token}))).code,'projection_unavailable')
    })
    await suite.test('private approved photos/audio receive expiring projection URLs; pending, hidden and foreign files do not',async()=>{
      reset();sql(`update public.wall_posts set created_at=now()-interval '11 minutes' where event_id='${eventId}' and guest_id='${guestId}' and request_hash<>'fixture';`)
      browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();const photos=await webpFixtures(page)
      mediaPost=await beginWall(token,'Multimedia para la pantalla',{photo_count:1,audio_count:1});assert.equal(mediaPost.ok,true)
      for(const body of [wallPhotoForm(token,mediaPost.post_id,photos),wallAudioForm(token,mediaPost.post_id,encodeWav(new Float32Array(32000)))])await checked(anonymous.functions.invoke('wall-media',{body}))
      await wall(token,{action:'submit',post_id:mediaPost.post_id})
      const sign=()=>checked(anonymous.functions.invoke('wall-media',{body:{action:'sign_projection',slug,access:projection.access,post_ids:[mediaPost.post_id]}}))
      assert.equal((await sign()).media.length,0);await checked(owner.rpc('moderate_wall_post',{p_post_id:mediaPost.post_id,p_status:'approved'}));const signed=await sign();assert.equal(signed.media.length,2)
      for(const media of signed.media)for(const path of media.urls){const url=new URL(path,apiUrl);assert.equal((await fetch(url)).status,200);const claims=JSON.parse(Buffer.from(url.searchParams.get('token').split('.')[1],'base64url').toString());assert.ok(claims.exp*1000<=Date.now()+61000)}
      await checked(owner.rpc('moderate_wall_post',{p_post_id:mediaPost.post_id,p_status:'hidden'}));assert.equal((await sign()).media.length,0)
      const otherOwner=users[7].sdk,foreignGuest=await checked(otherOwner.rpc('save_guest',{p_event_id:otherId,p_data:{full_name:'Otra invitación privada'}})),foreignToken=await checked(otherOwner.rpc('get_guest_invitation_token',{p_event_id:otherId,p_guest_id:foreignGuest})),foreignPost=await beginWall(foreignToken,'Fotografía de otro evento',{photo_count:1})
      await checked(anonymous.functions.invoke('wall-media',{body:wallPhotoForm(foreignToken,foreignPost.post_id,photos)}));await wall(foreignToken,{action:'submit',post_id:foreignPost.post_id});await checked(otherOwner.rpc('moderate_wall_post',{p_post_id:foreignPost.post_id,p_status:'approved'}))
      const foreignSign=await checked(anonymous.functions.invoke('wall-media',{body:{action:'sign_projection',slug,access:projection.access,post_ids:[foreignPost.post_id]}}));assert.equal(foreignSign.media.length,0)
    })
    await suite.test('revocation, rotation, expiration and revoked issuer permissions block subsequent reads and media signing',async()=>{
      reset();const old=projection;projection=await checked(moderator.rpc('issue_wall_projection_access',{p_event_id:eventId}));assert.equal((await screen({action:'sync'},old.access)).code,'projection_unavailable')
      sql(`update public.event_members set role='viewer' where event_id='${eventId}' and user_id='${users[4].id}';`);assert.equal((await screen()).code,'projection_unavailable');sql(`update public.event_members set role='moderator' where event_id='${eventId}' and user_id='${users[4].id}';`);assert.equal((await screen()).code,'projection_unavailable')
      await checked(owner.rpc('revoke_wall_projection_access',{p_event_id:eventId}));assert.equal((await screen()).code,'projection_unavailable')
      const administrator=users[7];sql(`update public.profiles set platform_role='super_admin' where user_id='${administrator.id}';`)
      projection=await checked(administrator.sdk.rpc('issue_wall_projection_access',{p_event_id:eventId}));assert.equal((await screen()).ok,true)
      sql(`update public.profiles set platform_role='organizer' where user_id='${administrator.id}';`);assert.equal((await screen()).code,'projection_unavailable')
      sql(`update public.profiles set platform_role='super_admin' where user_id='${administrator.id}';`);assert.equal((await screen()).code,'projection_unavailable')
      sql(`update public.profiles set platform_role='organizer' where user_id='${administrator.id}';`)
      sql(`update public.profiles set platform_role='super_admin' where user_id='${users[4].id}';`)
      projection=await checked(moderator.rpc('issue_wall_projection_access',{p_event_id:eventId}))
      sql(`update public.profiles set platform_role='organizer' where user_id='${users[4].id}';`);assert.equal((await screen()).ok,true)
      projection=await checked(owner.rpc('issue_wall_projection_access',{p_event_id:eventId}));sql(`update private.wall_projection_access set expires_at=now()-interval '1 second' where event_id='${eventId}';`);assert.equal((await screen()).code,'projection_unavailable');assert.ok((await anonymous.functions.invoke('wall-media',{body:{action:'sign_projection',slug,access:projection.access,post_ids:[]}})).error)
      projection=await checked(owner.rpc('issue_wall_projection_access',{p_event_id:eventId}));assert.equal((await screen()).ok,true)
    })
    await suite.test('event windows and server-side quotas protect a projection even with a correct credential',async()=>{
      reset();sql(`update public.events set session_closes_at=now()-interval '1 second' where id='${eventId}';`);assert.equal((await screen()).code,'projection_unavailable');sql(`update public.events set session_closes_at=now()+interval '20 days' where id='${eventId}';`)
      for(const access of ['bad','0'.repeat(64),projection.access.slice(0,63)+(projection.access.endsWith('a')?'b':'a')])assert.equal((await screen({action:'sync'},access)).code,'projection_unavailable')
      reset();const replies=await Promise.all(Array.from({length:32},()=>screen()));assert.equal(replies.filter(item=>item.code==='rate_limited').length,2)
      const limitedMedia=await fetch(`${apiUrl}/functions/v1/wall-media`,{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({action:'sign_projection',slug,access:projection.access,post_ids:[]})})
      assert.equal(limitedMedia.status,429);const limitedBody=await limitedMedia.json();assert.equal(limitedBody.error,'rate_limited');assert.ok(limitedBody.retry_after>=1&&limitedBody.retry_after<=60);assert.equal(limitedMedia.headers.get('retry-after'),String(limitedBody.retry_after))
      assert.ok((await owner.rpc('issue_wall_projection_access',{p_event_id:eventId,p_expires_at:new Date(Date.now()+24*3600000).toISOString()})).error)
    })
    await suite.test('projection actions are audited without credentials and cleanup removes event-scoped limiter state',async()=>{
      const rows=await checked(owner.from('audit_log').select('action,meta').eq('event_id',eventId).like('action','wall.projection_%'));assert.ok(rows.some(row=>row.action==='wall.projection_issued'));assert.ok(rows.some(row=>row.action==='wall.projection_revoked'));const data=JSON.stringify(rows);assert.equal(data.includes(token),false);assert.equal(data.includes(projection.access),false)
      assert.ok((await users[4].sdk.from('audit_log').update({meta:{forged:true}}).eq('event_id',eventId)).error)
    })
    await suite.test('projection link issuance is bounded across events and concurrent callers cannot exceed the actor quota',async()=>{
      const manager=users[1],count=Number(sql(`select count(*) from public.audit_log where actor_id='${manager.id}' and action='wall.projection_issued' and created_at>now()-interval '1 hour';`).trim())
      for(let index=count;index<19;index++)await checked(manager.sdk.rpc('issue_wall_projection_access',{p_event_id:eventId}))
      const results=await Promise.all(Array.from({length:3},()=>manager.sdk.rpc('issue_wall_projection_access',{p_event_id:eventId})));assert.equal(results.filter(result=>!result.error).length,1);assert.equal(results.filter(result=>result.error?.code==='54000').length,2)
    })
  }finally{
    await Promise.allSettled([...listeners,...users.map(user=>user.sdk)].map(sdk=>sdk.removeAllChannels()));await browser?.close()
    for(const event of events){await cleanupWall(event===eventId?users[0].sdk:users[7].sdk,event);sql(`delete from public.events where id='${event}';`)}
    assert.equal(Number(sql(`select count(*) from private.invitation_rate_limits where scope='projection_read' and bucket='${eventId}';`).trim()),0)
    removeTestUsers(users.map(user=>user.id))
  }
})
