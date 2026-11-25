import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { client, sql, removeTestUsers, removeTestMessage } from '../../scripts/local-test-helpers.mjs'

async function login(page, email, password) {
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible()
}
async function teamMail(email) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const listing = await (await fetch('http://127.0.0.1:54324/api/v1/messages?limit=100')).json()
    const message = listing.messages?.find(message => message.To?.some(recipient => recipient.Address === email))
    if (message) {
      const detail = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json()
      const link = [...String(detail.HTML).matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&')).find(link => link.startsWith('http://localhost:5174/equipo/aceptar#token='))
      if (link) return { id: message.ID, link }
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('No llegó la invitación de equipo a Mailpit local.')
}

for (const width of [360, 1440]) test(`real event and team lifecycle at ${width}px`, async ({ browser }) => {
  const password = `TeamBrowser42-${randomUUID()}`
  const accounts = [], contexts = []
  let eventId, messageId
  const exceptions = []
  try {
    for (const name of ['Anfitrión de prueba', 'Colaborador de prueba']) {
      const sdk = client(), email = `jotopa-team-browser-${randomUUID()}@example.test`
      if (width === 1440 && name === 'Colaborador de prueba') { accounts.push({ sdk, email, id: null }); continue }
      const result = await sdk.auth.signUp({ email, password, options: { data: { full_name: name } } })
      if (result.data.user) accounts.push({ sdk, email, id: result.data.user.id })
      expect(Boolean(result.error)).toBe(false)
    }
    const ownerContext = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }); contexts.push(ownerContext)
    const collaboratorContext = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }); contexts.push(collaboratorContext)
    const owner = await ownerContext.newPage(), collaborator = await collaboratorContext.newPage()
    for (const page of [owner, collaborator]) page.on('pageerror', () => exceptions.push('JavaScript exception'))
    await login(owner, accounts[0].email, password)
    await owner.goto('/eventos')
    await owner.getByRole('link', { name: 'Crear evento', exact: true }).click()
    await owner.getByLabel('Nombre del evento', { exact: true }).fill('Nuestro encuentro de prueba')
    await owner.getByLabel('Identificador del evento', { exact: true }).fill(`browser-${randomUUID()}`)
    await owner.getByLabel('Tipo de evento', { exact: true }).selectOption('anniversary')
    await owner.getByLabel('Fecha y hora', { exact: true }).fill('2027-09-15T18:30')
    await owner.getByLabel('Fecha límite de confirmación', { exact: true }).fill('2027-09-01T12:00')
    await owner.getByRole('button', { name: 'Crear evento', exact: true }).click()
    await expect(owner.getByRole('heading', { name: 'Nuestro encuentro de prueba', exact: true })).toBeVisible()
    eventId = new URL(owner.url()).pathname.split('/')[2]
    expect(/^[0-9a-f-]{36}$/.test(eventId)).toBe(true)
    const saved = await accounts[0].sdk.from('events').select('starts_at').eq('id', eventId).single()
    expect(new Date(saved.data.starts_at).toISOString()).toBe('2027-09-15T21:30:00.000Z')
    await owner.getByRole('link', { name: 'Editar evento', exact: true }).click()
    await owner.getByLabel('Nombre del evento', { exact: true }).fill('Nuestro encuentro actualizado')
    await owner.getByLabel('Fecha límite de confirmación', { exact: true }).fill('2027-09-01T12:00')
    await owner.getByLabel('Estado', { exact: true }).selectOption('active')
    await owner.getByRole('button', { name: 'Guardar evento', exact: true }).click()
    await expect(owner.getByRole('heading', { name: 'Nuestro encuentro actualizado', exact: true })).toBeVisible()
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (process.env.JOTOPA_CAPTURE_UI === '1') {
      await owner.locator('#main-content').focus()
      await owner.evaluate(() => window.scrollTo(0, 0))
      await owner.screenshot({ path: join(tmpdir(), `jotopa-event-${width}.png`), fullPage: true })
    }
    await owner.getByRole('link', { name: 'Equipo y colaboradores', exact: true }).click()
    await owner.getByLabel('Correo del colaborador', { exact: true }).fill(accounts[1].email)
    await owner.getByLabel('Rol del colaborador', { exact: true }).selectOption('content')
    await owner.getByRole('button', { name: 'Enviar invitación', exact: true }).click()
    await expect(owner.getByRole('status').filter({ hasText: 'Invitación enviada' })).toBeVisible()
    const message = await teamMail(accounts[1].email); messageId = message.id
    try { await collaborator.goto(message.link) } catch { throw new Error('No se pudo abrir la invitación local.') }
    await expect(collaborator.getByRole('heading', { name: 'Te invitaron a colaborar.', exact: true })).toBeVisible()
    await collaborator.locator('main').getByRole('link', { name: width === 1440 ? 'Crear cuenta' : 'Iniciar sesión', exact: true }).click()
    if (width === 1440) await collaborator.getByLabel('Nombre completo', { exact: true }).fill('Colaborador de prueba')
    await collaborator.getByLabel('Correo electrónico', { exact: true }).fill(accounts[1].email)
    await collaborator.getByLabel('Contraseña', { exact: true }).fill(password)
    if (width === 1440) await collaborator.getByLabel('Repetir contraseña', { exact: true }).fill(password)
    await collaborator.getByRole('button', { name: width === 1440 ? 'Crear mi cuenta' : 'Iniciar sesión', exact: true }).click()
    await expect(collaborator.getByRole('button', { name: 'Aceptar invitación', exact: true })).toBeVisible()
    if (width === 1440) {
      const registered = await accounts[1].sdk.auth.signInWithPassword({ email: accounts[1].email, password })
      accounts[1].id = registered.data.user?.id ?? null
      expect(Boolean(accounts[1].id)).toBe(true)
    }
    expect(new URL(collaborator.url()).hash).toBe('')
    await expect(collaborator.getByText('Contenido', { exact: true })).toBeVisible()
    await collaborator.getByRole('button', { name: 'Aceptar invitación', exact: true }).click()
    await expect(collaborator.getByRole('heading', { name: 'Nuestro encuentro actualizado', exact: true })).toBeVisible()
    await expect(collaborator.getByRole('link', { name: 'Editar evento', exact: true })).toHaveCount(0)
    await expect(collaborator.getByRole('link', { name: 'Equipo y colaboradores', exact: true })).toHaveCount(0)
    await collaborator.goto(`/eventos/${eventId}/editar`)
    await expect(collaborator.getByRole('alert')).toContainText('no tenés permiso')
    try { await collaborator.goto(message.link) } catch { throw new Error('No se pudo abrir la prueba de reutilización.') }
    await expect(collaborator.getByRole('alert')).toContainText('fue utilizada')
    await owner.getByRole('button', { name: 'Actualizar equipo', exact: true }).click()
    await owner.getByLabel('Rol de Colaborador de prueba', { exact: true }).selectOption('manager')
    await owner.getByRole('button', { name: 'Guardar rol', exact: true }).click()
    await expect(owner.getByText('Administrador', { exact: true }).filter({ visible: true })).toHaveCount(1)
    if (process.env.JOTOPA_CAPTURE_UI === '1') {
      await owner.locator('#main-content').focus()
      await owner.evaluate(() => window.scrollTo(0, 0))
      await owner.screenshot({ path: join(tmpdir(), `jotopa-team-${width}.png`), fullPage: true })
    }
    await collaborator.goto(`/eventos/${eventId}`)
    await expect(collaborator.getByRole('link', { name: 'Editar evento', exact: true })).toBeVisible()
    await collaborator.getByRole('link', { name: 'Equipo y colaboradores', exact: true }).click()
    const options = await collaborator.getByLabel('Rol del colaborador', { exact: true }).locator('option').evaluateAll(options => options.map(option => option.value))
    expect(options.includes('owner')).toBe(false)
    expect(await collaborator.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await owner.getByText('Quitar del equipo', { exact: true }).click()
    await owner.getByRole('button', { name: 'Confirmar quitar', exact: true }).click()
    await expect(owner.getByLabel('Rol de Colaborador de prueba', { exact: true })).toHaveCount(0)
    await expect(owner.getByText('Colaborador retirado', { exact: true })).toBeVisible()
    await collaborator.goto(`/eventos/${eventId}`)
    await expect(collaborator.getByRole('alert')).toContainText('no tenés permiso')
    await owner.goto(`/eventos/${eventId}`)
    await owner.getByText('Eliminar evento', { exact: true }).click()
    await owner.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click()
    await expect(owner.getByRole('heading', { name: 'Mis eventos', exact: true })).toBeVisible()
    await expect(owner.getByRole('heading', { name: 'Tu próximo encuentro empieza acá', exact: true })).toBeVisible()
    expect(exceptions).toHaveLength(0)
  } finally {
    await Promise.all(contexts.map(context => context.close()))
    if (accounts[0]?.id && /^[0-9a-f-]{36}$/.test(accounts[0].id)) sql(`delete from public.events where created_by='${accounts[0].id}'::uuid;`)
    if (accounts[1] && !accounts[1].id) { const result = await accounts[1].sdk.auth.signInWithPassword({ email: accounts[1].email, password }); accounts[1].id = result.data.user?.id ?? null }
    await Promise.allSettled(accounts.map(account => account.sdk.auth.signOut()))
    removeTestUsers(accounts.map(account => account.id).filter(Boolean))
    if (messageId) await removeTestMessage(messageId)
  }
})
