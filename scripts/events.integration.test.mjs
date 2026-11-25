import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { test } from 'node:test'
import { client, sql, removeTestUsers, removeTestMessage, apiUrl, publicKey } from './local-test-helpers.mjs'
import { ROLE_PERMISSIONS } from '../src/lib/permissions.ts'

test('real events, all seven roles, secure invitations and immutable audit', async context => {
  const roles = Object.keys(ROLE_PERMISSIONS)
  const users = [], eventIds = [], mailIds = []
  const password = `EventTest42-${randomUUID()}`
  const createArgs = title => ({ p_title: title, p_slug: `event-${randomUUID()}`, p_type: 'other', p_starts_at: '2027-07-01T20:00:00Z' })
  const checked = async promise => { const result = await promise; if (result.error) throw Object.assign(new Error('Unexpected local RPC failure'), { code: result.error.code }); return result.data }
  try {
    for (const role of [...roles, 'outsider','recipient']) {
      const sdk = client(), email = `jotopa-events-${randomUUID()}@example.test`
      const data = await checked(sdk.auth.signUp({ email, password, options: { data: { full_name: `Test ${role}` } } }))
      users.push({ sdk, email, id: data.user.id, role })
    }
    const byRole = role => users.find(user => user.role === role)
    const owner = byRole('owner'), manager = byRole('manager'), outsider = byRole('outsider'), recipient = byRole('recipient')
    const eventId = await checked(owner.sdk.rpc('create_event', createArgs('Role test event'))); eventIds.push(eventId)
    const otherId = await checked(outsider.sdk.rpc('create_event', createArgs('Other isolated event'))); eventIds.push(otherId)
    sql(`insert into public.event_members(event_id,user_id,role) values ${users.filter(user => roles.includes(user.role) && user.role !== 'owner').map(user => `('${eventId}','${user.id}','${user.role}')`).join(',')};`)
    const updateArgs = { p_event_id: eventId, p_title: 'Updated event', p_slug: `updated-${randomUUID()}`, p_type: 'other', p_starts_at: '2027-07-01T20:00:00Z', p_timezone: 'America/Asuncion', p_rsvp_deadline:'2027-06-01T20:00:00Z', p_status: 'draft' }
    await context.test('creation is atomic, assigns owner and validates timezone/slug without orphan rows', async () => {
      assert.equal(await checked(owner.sdk.rpc('get_my_event_role', { p_event_id: eventId })), 'owner')
      const before = await checked(owner.sdk.from('events').select('id'))
      assert.ok((await owner.sdk.rpc('create_event', { ...createArgs('Invalid event'), p_timezone: 'Invalid/Zone' })).error)
      const after = await checked(owner.sdk.from('events').select('id'))
      assert.equal(after.length, before.length)
      await checked(owner.sdk.rpc('update_event',{...updateArgs,p_rsvp_deadline:'2027-06-01T20:00:00Z'}))
      await checked(owner.sdk.rpc('update_event',updateArgs))
      assert.equal(Date.parse((await checked(owner.sdk.from('events').select('rsvp_deadline').eq('id',eventId).single())).rsvp_deadline),Date.parse('2027-06-01T20:00:00Z'));assert.ok((await owner.sdk.rpc('update_event',{...updateArgs,p_rsvp_deadline:null})).error)
      assert.ok((await owner.sdk.from('events').insert({ title: 'Spoofed', created_by: outsider.id })).error)
    })
    await context.test('seven SQL permission matrices match the UI and reject unknown permissions', async () => {
      const allPermissions = ROLE_PERMISSIONS.owner
      for (const role of roles) {
        const user = byRole(role)
        assert.deepEqual((await checked(user.sdk.rpc('event_role_permissions', { p_role: role }))).sort(), [...ROLE_PERMISSIONS[role]].sort())
        for (const permission of [...allPermissions,'unknown.permission']) {
          const granted = await checked(user.sdk.rpc('has_event_permission', { event_id: eventId, permission }))
          assert.equal(granted, ROLE_PERMISSIONS[role].includes(permission), `${role}: ${permission}`)
        }
        const update = await user.sdk.rpc('update_event', updateArgs)
        assert.equal(Boolean(update.error), !['owner','manager'].includes(role), role)
        if (role !== 'owner') assert.ok((await user.sdk.rpc('delete_event', { p_event_id: eventId })).error)
      }
    })
    await context.test('events, team, invitations and audit remain isolated across events and roles', async () => {
      assert.equal((await checked(outsider.sdk.from('events').select('id').eq('id',eventId))).length, 0)
      assert.equal((await checked(owner.sdk.from('events').select('id').eq('id',otherId))).length, 0)
      assert.equal(await checked(outsider.sdk.rpc('has_event_permission', { event_id: eventId, permission: 'event.read' })), false)
      assert.ok((await outsider.sdk.rpc('update_event', updateArgs)).error)
      assert.ok((await outsider.sdk.rpc('list_event_team', { p_event_id: eventId })).error)
      assert.equal((await checked(outsider.sdk.from('event_members').select('id').eq('event_id',eventId))).length, 0)
      assert.equal((await checked(outsider.sdk.from('event_member_invites').select('id').eq('event_id',eventId))).length, 0)
      assert.equal((await checked(byRole('viewer').sdk.from('audit_log').select('id').eq('event_id',eventId))).length, 0)
      assert.equal((await checked(byRole('content').sdk.from('event_members').select('id').eq('event_id',eventId))).length, 1)
    })
    await context.test('direct DML, self role changes and manager elevation are denied', async () => {
      assert.ok((await owner.sdk.from('event_members').insert({ event_id:eventId,user_id:outsider.id,role:'owner' })).error)
      assert.ok((await owner.sdk.from('event_members').update({ role:'owner' }).eq('event_id',eventId)).error)
      assert.ok((await owner.sdk.rpc('change_event_member_role',{p_event_id:eventId,p_user_id:owner.id,p_role:'viewer'})).error)
      assert.ok((await manager.sdk.rpc('change_event_member_role',{p_event_id:eventId,p_user_id:manager.id,p_role:'owner'})).error)
      assert.ok((await manager.sdk.rpc('remove_event_member',{p_event_id:eventId,p_user_id:owner.id})).error)
      assert.ok((await manager.sdk.rpc('change_event_member_role',{p_event_id:eventId,p_user_id:owner.id,p_role:'viewer'})).error)
      assert.ok((await manager.sdk.rpc('create_event_member_invite',{p_event_id:eventId,p_email:outsider.email,p_role:'owner'})).error)
      assert.ok((await byRole('viewer').sdk.rpc('create_event_member_invite',{p_event_id:eventId,p_email:outsider.email,p_role:'viewer'})).error)
    })
    const issue = async (email, role='viewer', issuer=owner) => (await checked(issuer.sdk.rpc('create_event_member_invite',{p_event_id:eventId,p_email:email,p_role:role})))[0]
    await context.test('tokens are 256-bit, hashed, email-bound, role-bound and atomically single-use', async () => {
      const invitation = await issue(recipient.email,'content')
      assert.ok(/^[a-f0-9]{64}$/.test(invitation.token))
      const stored = JSON.parse(sql(`select json_build_object('hash',token_hash,'email',email) from public.event_member_invites where id='${invitation.invite_id}';`).trim())
      assert.equal(stored.hash === createHash('sha256').update(invitation.token).digest('hex'), true)
      assert.ok((await owner.sdk.from('event_member_invites').select('token_hash')).error)
      assert.ok((await outsider.sdk.rpc('accept_event_member_invite',{p_token:invitation.token})).error)
      const preview = await checked(recipient.sdk.rpc('preview_event_member_invite',{p_token:invitation.token}))
      assert.equal(preview[0].role,'content')
      assert.ok((await recipient.sdk.rpc('accept_event_member_invite',{p_token:invitation.token,p_role:'owner'})).error)
      const attempts = await Promise.all([recipient.sdk.rpc('accept_event_member_invite',{p_token:invitation.token}),recipient.sdk.rpc('accept_event_member_invite',{p_token:invitation.token})])
      assert.equal(attempts.filter(result=>!result.error).length,1)
      assert.equal(await checked(recipient.sdk.rpc('get_my_event_role',{p_event_id:eventId})),'content')
      assert.ok((await recipient.sdk.rpc('preview_event_member_invite',{p_token:invitation.token})).error)
    })
    await context.test('expired, revoked, replaced and demoted-issuer invitations cannot be accepted', async () => {
      const expired = await issue(outsider.email)
      sql(`update public.event_member_invites set expires_at=now()-interval '1 second' where id='${expired.invite_id}';`)
      assert.ok((await outsider.sdk.rpc('accept_event_member_invite',{p_token:expired.token})).error)
      const revoked = await issue(outsider.email)
      await checked(owner.sdk.rpc('revoke_event_member_invite',{p_invite_id:revoked.invite_id}))
      assert.ok((await outsider.sdk.rpc('accept_event_member_invite',{p_token:revoked.token})).error)
      const replaced = await issue(outsider.email)
      await issue(outsider.email)
      assert.ok((await outsider.sdk.rpc('accept_event_member_invite',{p_token:replaced.token})).error)
      const stale = await issue(outsider.email,'viewer',manager)
      await checked(owner.sdk.rpc('change_event_member_role',{p_event_id:eventId,p_user_id:manager.id,p_role:'viewer'}))
      assert.ok((await outsider.sdk.rpc('accept_event_member_invite',{p_token:stale.token})).error)
      await checked(owner.sdk.rpc('change_event_member_role',{p_event_id:eventId,p_user_id:manager.id,p_role:'manager'}))
    })
    await context.test('mail Edge Function verifies real JWTs and sends a real local invitation', async () => {
      for (const authorization of ['', 'Bearer invalid.fixture.jwt']) {
        const denied = await fetch(`${apiUrl}/functions/v1/invite-member`,{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify({eventId,email:outsider.email,role:'viewer'})})
        assert.equal(denied.status,401)
      }
      const forbidden = await byRole('viewer').sdk.functions.invoke('invite-member',{body:{eventId,email:outsider.email,role:'viewer'}})
      assert.equal(forbidden.error?.context?.status,403)
      const sent = await owner.sdk.functions.invoke('invite-member',{body:{eventId,email:outsider.email,role:'viewer'}})
      if(sent.error) throw new Error('La Edge Function de correo local no respondió correctamente.')
      assert.equal(sent.data.delivery,'sent')
      assert.equal('link' in sent.data,false)
      let message
      for(let attempt=0;attempt<20;attempt++){
        const listing=await(await fetch('http://127.0.0.1:54324/api/v1/messages?limit=100')).json()
        message=listing.messages?.find(message=>message.To?.some(recipient=>recipient.Address===outsider.email))
        if(message)break
        await new Promise(resolve=>setTimeout(resolve,200))
      }
      assert.ok(message)
      mailIds.push(message.ID)
      const detail=await(await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json()
      assert.ok(detail.HTML.includes('/equipo/aceptar#token='))
    })
    await context.test('server limits invitation issuance to twenty per user per hour', async () => {
      const count=Number(sql(`select count(*) from public.event_member_invites where created_by='${owner.id}' and created_at>now()-interval '1 hour';`).trim())
      for(let attempt=count;attempt<19;attempt++) {
        await checked(owner.sdk.rpc('create_event_member_invite',{p_event_id:eventId,p_email:`limit-${attempt}@example.test`,p_role:'viewer'}))
      }
      const rateEvent=await checked(owner.sdk.rpc('create_event',createArgs('Cross-event rate test')));eventIds.push(rateEvent)
      const concurrent=await Promise.all([eventId,rateEvent].map((id,index)=>owner.sdk.rpc('create_event_member_invite',{p_event_id:id,p_email:`concurrent-${index}@example.test`,p_role:'viewer'})))
      assert.equal(concurrent.filter(result=>!result.error).length,1)
      assert.equal(concurrent.find(result=>result.error)?.error.message,'invite_rate_limit')
      assert.equal((await owner.sdk.rpc('create_event_member_invite',{p_event_id:eventId,p_email:'over-limit@example.test',p_role:'viewer'})).error?.message,'invite_rate_limit')
      assert.equal(Number(sql(`select count(*) from public.event_member_invites where created_by='${owner.id}' and created_at>now()-interval '1 hour';`).trim()),20)
    })
    await context.test('sensitive actions are attributed and audit cannot be inserted, updated or deleted', async () => {
      const audit=await checked(owner.sdk.from('audit_log').select('action,actor_id,target,meta').eq('event_id',eventId))
      for(const action of ['event.created','event.updated','member.added','member.role_changed','invite.created','invite.accepted','invite.revoked'])assert.ok(audit.some(entry=>entry.action===action),action)
      assert.ok(audit.some(entry=>entry.action==='event.created'&&entry.actor_id===owner.id))
      const serialized=JSON.stringify(audit)
      assert.equal(serialized.includes('@'),false)
      assert.equal(serialized.includes('token'),false)
      assert.ok((await owner.sdk.from('audit_log').insert({event_id:eventId,actor_id:owner.id,action:'forged',target:eventId})).error)
      assert.ok((await owner.sdk.from('audit_log').update({action:'forged'}).eq('event_id',eventId)).error)
      assert.ok((await owner.sdk.from('audit_log').delete().eq('event_id',eventId)).error)
    })
    await context.test('the last owner survives direct removal and concurrent attempts; deletion preserves audit', async () => {
      const denied=await owner.sdk.rpc('remove_event_member',{p_event_id:eventId,p_user_id:owner.id})
      assert.equal(denied.error?.message,'last_owner')
      await checked(owner.sdk.rpc('change_event_member_role',{p_event_id:eventId,p_user_id:recipient.id,p_role:'owner'}))
      const attempts=await Promise.all([owner.sdk.rpc('remove_event_member',{p_event_id:eventId,p_user_id:owner.id}),recipient.sdk.rpc('remove_event_member',{p_event_id:eventId,p_user_id:recipient.id})])
      assert.equal(attempts.filter(result=>!result.error).length,1)
      const ownerId=sql(`select user_id from public.event_members where event_id='${eventId}' and role='owner';`).trim()
      const remaining=users.find(user=>user.id===ownerId)
      assert.ok(remaining)
      await checked(remaining.sdk.rpc('delete_event',{p_event_id:eventId}))
      assert.equal((await checked(remaining.sdk.from('events').select('id').eq('id',eventId))).length,0)
      assert.ok((await checked(remaining.sdk.from('audit_log').select('action').eq('event_id',eventId))).some(entry=>entry.action==='event.deleted'))
    })
  } finally {
    if(eventIds.length)sql(`delete from public.events where id in (${eventIds.map(id=>`'${id}'::uuid`).join(',')});`)
    await Promise.allSettled(users.map(user=>user.sdk.auth.signOut()))
    removeTestUsers(users.map(user=>user.id))
    for(const id of mailIds)await removeTestMessage(id)
  }
})
