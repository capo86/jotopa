import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSupabaseConfiguration } from './supabase-config.ts'
import { SupabaseConnectionError, verifySupabaseConnection } from './supabase-connection.ts'

// Synthetic fixtures are only used by mocked requests; no real keys are loaded.
const config = { url: 'http://127.0.0.1:54321', publicKey: 'sb_publishable_test_fixture' }
const signal = () => new AbortController().signal
const description = { external: { email: true } }
const errorWithCode = (code: string) => (error: unknown) => error instanceof SupabaseConnectionError && error.code === code
const legacyKey = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`

test('configuration distinguishes missing, invalid and public keys', () => {
  assert.equal(parseSupabaseConfiguration(undefined, undefined).status, 'missing')
  assert.equal(parseSupabaseConfiguration(config.url, ' ').status, 'missing')
  assert.equal(parseSupabaseConfiguration('not-a-url', config.publicKey).status, 'invalid')
  assert.equal(parseSupabaseConfiguration('ftp://localhost', config.publicKey).status, 'invalid')
  assert.equal(parseSupabaseConfiguration('http://user:password@localhost', config.publicKey).status, 'invalid')
  assert.equal(parseSupabaseConfiguration(config.url, config.publicKey).status, 'configured')
  assert.equal(parseSupabaseConfiguration(config.url, legacyKey('anon')).status, 'configured')
})

test('secret keys, service role JWTs and malformed keys are rejected', () => {
  for (const key of ['sb_secret_test_fixture', legacyKey('service_role'), 'arbitrary-key', 'header.invalid.signature']) {
    assert.deepEqual(parseSupabaseConfiguration(config.url, key), { status: 'invalid', config: null })
  }
})

test('connection checks the public Auth endpoint with a read-only request', async () => {
  let calls = 0
  const request: typeof fetch = async (input, init) => {
    calls += 1
    assert.equal(String(input), `${config.url}/auth/v1/settings`)
    assert.equal(init?.method, 'GET')
    assert.equal(init?.cache, 'no-store')
    assert.equal(init?.credentials, 'omit')
    assert.equal(init?.redirect, 'error')
    assert.equal(new Headers(init?.headers).get('apikey'), config.publicKey)
    return Response.json(description)
  }
  const result = await verifySupabaseConnection(config, signal(), request)
  assert.equal(calls, 1)
  assert.ok(Number.isFinite(Date.parse(result.verifiedAt)))
  assert.deepEqual(Object.keys(result), ['verifiedAt'])
})

test('missing configuration never sends a request', async () => {
  const request: typeof fetch = async () => { assert.fail('Unexpected network request') }
  await assert.rejects(verifySupabaseConnection(null, signal(), request), errorWithCode('configuration'))
})

test('HTTP failures and unexpected response bodies are classified without exposing them', async () => {
  for (const [status, code] of [[401, 'credentials'], [403, 'credentials'], [503, 'unavailable']] as const) {
    await assert.rejects(verifySupabaseConnection(config, signal(), async () => new Response('private response fixture', { status })), errorWithCode(code))
  }
  await assert.rejects(verifySupabaseConnection(config, signal(), async () => Response.json({ ok: true })), errorWithCode('response'))
  await assert.rejects(verifySupabaseConnection(config, signal(), async () => new Response('not JSON')), errorWithCode('response'))
})

test('raw network errors are replaced with a safe message', async () => {
  await assert.rejects(verifySupabaseConnection(config, signal(), async () => {
    throw new Error('private raw failure fixture')
  }), (error: unknown) => error instanceof SupabaseConnectionError && error.code === 'network' && !error.message.includes('fixture'))
})

test('cancellation is preserved and does not become a connection error', async () => {
  const controller = new AbortController()
  controller.abort()
  const request: typeof fetch = async (_input, init) => {
    init?.signal?.throwIfAborted()
    return Response.json(description)
  }
  await assert.rejects(verifySupabaseConnection(config, controller.signal, request), { name: 'AbortError' })
})

test('timeouts have a dedicated safe error', async (context) => {
  context.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort(new DOMException('Expired', 'TimeoutError')))
  const request: typeof fetch = async (_input, init) => {
    init?.signal?.throwIfAborted()
    return Response.json(description)
  }
  await assert.rejects(verifySupabaseConnection(config, signal(), request), errorWithCode('timeout'))
})
