import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createInvitationHandler, InvitationError } from './handler.ts'
import type { InvitationServices } from './handler.ts'

const token = 'a'.repeat(64)
const eventId = '10000000-0000-4000-8000-000000000001'
const services = (): InvitationServices => ({ appUrl: 'http://localhost:5174', authorize: async authorization => authorization === 'Bearer valid.fixture.jwt', issue: async () => ({ id: eventId, token, eventTitle: 'Nuestro encuentro' }), send: async () => true })
const request = (body: unknown, authorization = 'Bearer valid.fixture.jwt') => new Request('http://localhost/invite-member', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const values = { eventId, email: 'test@example.test', role: 'viewer' }

test('team mail endpoint denies missing/invalid authentication before issuing a token', async () => {
  const dependencies = services()
  dependencies.issue = async () => { assert.fail('Unauthorized token issuance') }
  for (const auth of ['', 'Bearer invalid.fixture.jwt']) assert.equal((await createInvitationHandler(dependencies)(request(values, auth))).status, 401)
})
test('team mail endpoint validates input, size and origin', async () => {
  const handler = createInvitationHandler(services())
  assert.equal((await handler(request({ ...values, role: 'administrator' }))).status, 400)
  assert.equal((await handler(request({ ...values, email: 'bad' }))).status, 400)
  assert.equal((await handler(request({ payload: 'x'.repeat(5000) }))).status, 413)
  const badOrigin = request(values)
  badOrigin.headers.set('Origin','https://untrusted.example')
  assert.equal((await handler(badOrigin)).status, 403)
})
test('sent invitation responses omit the secret token while free fallback uses a fragment', async () => {
  const dependencies = services()
  const sent = await createInvitationHandler(dependencies)(request(values))
  const content = await sent.text()
  assert.equal(content.includes(token), false)
  assert.equal(JSON.parse(content).delivery, 'sent')
  dependencies.send = async () => false
  const fallback = await (await createInvitationHandler(dependencies)(request(values))).json() as { link: string; delivery: string }
  assert.equal(fallback.delivery, 'manual')
  assert.equal(new URL(fallback.link).search, '')
  assert.equal(new URL(fallback.link).hash, `#token=${token}`)
})
test('mail endpoint returns only sanitized authorization failures', async () => {
  const dependencies = services()
  dependencies.issue = async () => { throw new InvitationError(403, 'forbidden') }
  const response = await createInvitationHandler(dependencies)(request(values))
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'forbidden' })
})
