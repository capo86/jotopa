import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { client, removeTestUsers, sql } from './local-test-helpers.mjs'

test('real local Auth and profile isolation through the public SDK', async (context) => {
  const first = client(), second = client(), anonymous = client()
  const ids = []
  const password = `TestPass42-${randomUUID()}`
  const email = `jotopa-test-${randomUUID()}@example.test`
  try {
    await context.test('the Auth server rejects weak passwords independently of the UI', async () => {
      const result = await anonymous.auth.signUp({ email: `jotopa-weak-${randomUUID()}@example.test`, password: 'weak' })
      if (result.data.user) ids.push(result.data.user.id)
      assert.ok(result.error)
    })
    await context.test('signup creates organizer and ignores requested administrator metadata', async () => {
      for (const [sdk, address] of [[first, email], [second, `jotopa-test-${randomUUID()}@example.test`]]) {
        const { data, error } = await sdk.auth.signUp({ email: address, password, options: { data: { full_name: 'Local test', platform_role: 'super_admin' } } })
        assert.equal(error?.code, undefined)
        assert.ok(data.session)
        ids.push(data.user.id)
        const profile = await sdk.from('profiles').select('*').single()
        assert.equal(profile.error?.code, undefined)
        assert.equal(profile.data?.platform_role, 'organizer')
      }
    })
    await context.test('logout, incorrect login, correct login and refresh token work', async () => {
      assert.equal((await first.auth.signOut()).error, null)
      assert.equal((await first.auth.getSession()).data.session, null)
      assert.ok((await first.auth.signInWithPassword({ email, password: 'IncorrectPassword42' })).error)
      assert.equal((await first.auth.signInWithPassword({ email, password })).error, null)
      const refreshed = await first.auth.refreshSession()
      assert.equal(refreshed.error, null)
      assert.ok(refreshed.data.session)
    })
    await context.test('anonymous access, insert, upsert and deletion are denied', async () => {
      assert.ok((await anonymous.from('profiles').select('*')).error)
      assert.ok((await first.from('profiles').insert({ user_id: ids[0] })).error)
      assert.ok((await first.from('profiles').upsert({ user_id: ids[0], full_name: 'Forbidden' })).error)
      assert.ok((await first.from('profiles').delete().eq('user_id', ids[0])).error)
    })
    await context.test('only the own name can be updated; another user stays invisible', async () => {
      const updated = await first.from('profiles').update({ full_name: 'Updated local test' }).eq('user_id', ids[0]).select().single()
      assert.equal(updated.error, null)
      assert.equal(updated.data?.full_name, 'Updated local test')
      const other = await first.from('profiles').select('*').eq('user_id', ids[1])
      assert.equal(other.error, null)
      assert.equal(other.data?.length, 0)
      const foreignUpdate = await first.from('profiles').update({ full_name: 'Forbidden' }).eq('user_id', ids[1]).select()
      assert.equal(foreignUpdate.error, null)
      assert.equal(foreignUpdate.data?.length, 0)
      assert.equal((await second.from('profiles').select('full_name').single()).data?.full_name, 'Local test')
    })
    await context.test('role, identity and timestamps cannot be changed through REST', async () => {
      for (const patch of [{ platform_role: 'super_admin' }, { user_id: ids[1] }, { id: randomUUID() }, { created_at: new Date().toISOString() }, { updated_at: new Date().toISOString() }]) {
        assert.ok((await first.from('profiles').update(patch).eq('user_id', ids[0])).error)
      }
      assert.equal((await first.auth.updateUser({ data: { platform_role: 'super_admin' } })).error, null)
      assert.equal((await first.from('profiles').select('platform_role').single()).data?.platform_role, 'organizer')
    })
    await context.test('trusted SQL can assign super_admin without bypassing profile RLS for that user', async () => {
      sql(`update public.profiles set platform_role = 'super_admin' where user_id = '${ids[0]}'::uuid;`)
      const profiles = await first.from('profiles').select('*')
      assert.equal(profiles.data?.length, 1)
      assert.equal(profiles.data?.[0]?.platform_role, 'super_admin')
      assert.ok((await first.from('profiles').update({ platform_role: 'organizer' }).eq('user_id', ids[0])).error)
    })
  } finally {
    await Promise.allSettled([first.auth.signOut(), second.auth.signOut()])
    removeTestUsers(ids)
  }
})
