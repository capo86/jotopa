import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localDateTime, utcDateTime } from './dates.ts'
import { eventFormSchema } from './schemas.ts'
import { hasPermission, canManageRole } from '../../lib/permissions.ts'
import { returnPath } from '../auth/return-path.ts'

test('event dates use the selected timezone and roundtrip through UTC', () => {
  assert.equal(utcDateTime('2027-07-01T17:30','America/Asuncion'), '2027-07-01T20:30:00.000Z')
  assert.equal(localDateTime('2027-07-01T20:30:00Z','America/Asuncion'), '2027-07-01T17:30')
  assert.equal(utcDateTime('2027-07-01T17:30','UTC'), '2027-07-01T17:30:00.000Z')
  assert.throws(() => utcDateTime('2027-02-30T17:30','UTC'))
})
test('event validation rejects invalid slugs, missing dates and deadlines after the event', () => {
  const values = { title: 'Nuestro evento', slug: 'nuestro-evento', type: 'other', startsAt: '2027-07-01T17:30', timezone: 'America/Asuncion', rsvpDeadline: '2027-06-30T17:30', status: 'draft' }
  assert.ok(eventFormSchema.safeParse(values).success)
  for (const patch of [{ rsvpDeadline: '' }, { slug: 'invalid slug' }, { startsAt: '' }, { timezone: 'Invalid/Zone' }, { rsvpDeadline: '2027-07-02T17:30' }]) assert.equal(eventFormSchema.safeParse({ ...values, ...patch }).success, false)
})
test('UI permissions deny owner assignment by managers and configuration access by content roles', () => {
  assert.equal(canManageRole('manager','owner'), false)
  assert.equal(canManageRole('manager','manager'), true)
  assert.equal(hasPermission('content','event.update'), false)
  assert.equal(hasPermission('content','content.write'), true)
  assert.equal(hasPermission('checkin','guests.contact_read'), false)
})
test('private event return paths and team acceptance survive authentication without open redirects', () => {
  const path = '/eventos/10000000-0000-4000-8000-000000000001/equipo'
  assert.equal(returnPath({ from: path }), path)
  assert.equal(returnPath({ from: '/equipo/aceptar' }), '/equipo/aceptar')
  assert.equal(returnPath({ from: '/eventos/../../example.test' }), '/eventos')
})
