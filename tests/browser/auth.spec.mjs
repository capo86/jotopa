import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { client, removeTestUsers, removeTestMessage, apiUrl } from '../../scripts/local-test-helpers.mjs'

async function recoveryLink(email) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch('http://127.0.0.1:54324/api/v1/messages?limit=100')
    const listing = await response.json()
    const message = listing.messages?.find(message => message.To?.some(recipient => recipient.Address === email))
    if (message) {
      const detail = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json()
      const links = [...String(detail.HTML).matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'))
      const link = links.find(link => link.startsWith(`${apiUrl}/auth/v1/verify?`))
      if (link) return { link, messageId: message.ID }
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error('No llegó el mensaje de recuperación a Mailpit local.')
}

test('private access, profile, session persistence, logout, login and password recovery', async ({ page }) => {
  const email = `jotopa-browser-${randomUUID()}@example.test`
  const password = `BrowserPass42-${randomUUID()}`
  const newPassword = `UpdatedPass42-${randomUUID()}`
  const account = client()
  const ids = []
  let messageId
  const errors = []
  page.on('pageerror', () => errors.push('JavaScript exception'))
  try {
    await page.goto('/perfil')
    await expect(page).toHaveURL(/\/iniciar-sesion$/)
    await page.goto('/eventos')
    await expect(page).toHaveURL(/\/iniciar-sesion$/)
    await page.goto('/restablecer-contrasena')
    await expect(page.getByRole('heading', { name: 'Necesitás un enlace válido.' })).toBeVisible()

    const created = await account.auth.signUp({ email, password, options: { data: { full_name: 'Anfitriona de prueba' } } })
    if (created.data.user) ids.push(created.data.user.id)
    expect(Boolean(created.error)).toBe(false)
    await page.goto('/iniciar-sesion')
    await expect(page.locator('a[href="/registro"]')).toHaveCount(0)
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/\/eventos$/)
    await page.goto('/perfil')
    await expect(page.getByText('Organizador', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Nombre completo', { exact: true })).toHaveValue('Anfitriona de prueba')

    await page.getByLabel('Nombre completo', { exact: true }).fill('Nombre actualizado')
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Tu perfil se actualizó.' })).toBeVisible()
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.reload()
    await expect(page.getByLabel('Nombre completo', { exact: true })).toHaveValue('Nombre actualizado')
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await expect(page).toHaveURL(/\/iniciar-sesion$/)
    await page.goto('/perfil')
    await expect(page).toHaveURL(/\/iniciar-sesion$/)
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill('IncorrectPassword42')
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('no son correctos')
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/\/perfil$/)
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await expect(page).toHaveURL(/\/iniciar-sesion$/)

    await page.goto('/recuperar-contrasena')
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Enviar enlace de recuperación', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Si existe una cuenta' })).toBeVisible()
    const message = await recoveryLink(email)
    messageId = message.messageId
    try { await page.goto(message.link) } catch { throw new Error('No se pudo abrir el enlace local de recuperación.') }
    expect(new URL(page.url()).pathname).toBe('/restablecer-contrasena')
    await expect(page.getByLabel('Nueva contraseña', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Nueva contraseña', { exact: true })).toBeVisible()
    await page.getByLabel('Nueva contraseña', { exact: true }).fill(newPassword)
    await page.getByLabel('Repetir contraseña', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click()
    await expect(page).toHaveURL(/\/perfil$/)
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await expect(page).toHaveURL(/\/iniciar-sesion$/)
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('no son correctos')
    await page.getByLabel('Contraseña', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/\/eventos$/)
    expect(errors).toHaveLength(0)
  } finally {
    // Cleanup touches only accounts and Mailpit messages created by this test.
    if (!ids.length) {
      const result = await account.auth.signInWithPassword({ email, password })
      if (result.data.user) ids.push(result.data.user.id)
    }
    await account.auth.signOut()
    removeTestUsers(ids)
    if (messageId) await removeTestMessage(messageId)
  }
})

test('public forms remain usable at 360px and 1440px', async ({ page }) => {
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/iniciar-sesion', '/recuperar-contrasena']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.locator('form')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  }
})
