import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerSchema, resetPasswordSchema, loginSchema } from './schemas.ts'
import { returnPath } from './return-path.ts'
import { authErrorMessage } from './errors.ts'

test('registration validates name, email, password strength and confirmation', () => {
  const valid = { fullName: 'Anfitriona', email: 'host@example.test', password: 'StrongTestPass42', confirmPassword: 'StrongTestPass42' }
  assert.ok(registerSchema.safeParse(valid).success)
  for (const values of [{ fullName: '' }, { email: 'invalid' }, { password: 'short' }, { confirmPassword: 'different' }]) {
    assert.equal(registerSchema.safeParse({ ...valid, ...values }).success, false)
  }
  const parsed = registerSchema.parse({ ...valid, platform_role: 'super_admin' })
  assert.equal('platform_role' in parsed, false)
})

test('login permits existing passwords and reset enforces the new password rules', () => {
  assert.ok(loginSchema.safeParse({ email: 'host@example.test', password: 'legacy' }).success)
  assert.equal(resetPasswordSchema.safeParse({ password: 'weak', confirmPassword: 'weak' }).success, false)
})

test('return paths cannot redirect outside the supported private pages', () => {
  for (const from of ['https://example.test', '//example.test', '/configuracion', '/restablecer-contrasena', null]) assert.equal(returnPath({ from }), '/eventos')
  assert.equal(returnPath({ from: '/eventos' }), '/eventos')
  assert.equal(returnPath(undefined), '/eventos')
  for (const suffix of ['invitados', 'invitados/importar','invitaciones','invitaciones/plantillas','buenos-deseos']) {
    const path = `/eventos/30000000-0000-4000-8000-000000000001/${suffix}`
    assert.equal(returnPath({ from: path }), path)
  }
})

test('authentication failures never forward raw server messages', () => {
  assert.match(authErrorMessage({ code: 'invalid_credentials' }), /no son correctos/)
  assert.equal(authErrorMessage(new Error('sensitive response fixture')).includes('sensitive'), false)
})
