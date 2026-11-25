import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { client, sql, removeTestUsers } from '../../scripts/local-test-helpers.mjs'

const checked = async promise => { const result = await promise; if(result.error) throw new Error(`Guest browser fixture failed: ${result.error.code}`); return result.data }
const login = async (page,account,password) => {
  await page.goto('/iniciar-sesion');await page.getByLabel('Correo electrónico',{exact:true}).fill(account.email)
  await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible()
}
const workbookDownload = async download => { const path = await download.path(); const book = new ExcelJS.Workbook(); await book.xlsx.load(await readFile(path));return book }

for(const width of [360,1440]) test(`guest CRUD, actual Excel import/export and restricted access at ${width}px`,async({browser})=>{
  const users=[], contexts=[], exceptions=[], password=`GuestBrowser42-${randomUUID()}`
  let eventId
  try {
    for(const role of ['owner','checkin','viewer']) {
      const sdk=client(),email=`jotopa-guest-browser-${randomUUID()}@example.test`
      const result=await checked(sdk.auth.signUp({email,password,options:{data:{full_name:`Guest browser ${role}`}}}))
      users.push({sdk,email,id:result.user.id,role})
    }
    eventId=await checked(users[0].sdk.rpc('create_event',{p_title:'Encuentro de primavera',p_slug:`guest-browser-${randomUUID()}`,p_type:'other',p_starts_at:'2027-07-01T20:00:00Z'}))
    sql(`insert into public.event_members(event_id,user_id,role) values ${users.slice(1).map(u=>`('${eventId}','${u.id}','${u.role}')`).join(',')};`)
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});contexts.push(context)
    const page=await context.newPage();page.on('pageerror',()=>exceptions.push('Unexpected browser error'))
    await login(page,users[0],password);await page.goto(`/eventos/${eventId}`)
    await page.getByRole('link',{name:'Invitados',exact:true}).click()
    await expect(page.getByText('Tu lista está por comenzar',{exact:true})).toBeVisible()
    await page.getByRole('button',{name:/Agregar invitado/}).click()
    const dialog=page.getByRole('dialog');await dialog.getByLabel('Destinatario',{exact:true}).fill('Ana de prueba')
    await dialog.getByLabel('Teléfono',{exact:true}).fill('0981123456');await dialog.getByLabel('Correo electrónico',{exact:true}).fill('ana.fixture@example.test')
    await dialog.getByLabel('Grupo (opcional)',{exact:true}).fill('Familia');await dialog.getByLabel('Cupo total',{exact:true}).fill('3')
    await dialog.getByRole('button',{name:'Guardar invitado',exact:true}).click();await expect(dialog).toHaveCount(0)
    await expect(page.getByText('+595981123456',{exact:true})).toBeVisible()
    await page.getByRole('button',{name:'Editar a Ana de prueba',exact:true}).click()
    await page.getByRole('dialog').getByLabel('Destinatario',{exact:true}).fill('Ana actualizada')
    await page.getByRole('button',{name:'Guardar invitado',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
    const templatePending=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar plantilla',exact:true}).click()
    const template=await workbookDownload(await templatePending),sheet=template.getWorksheet('Invitados')
    expect(sheet.getCell('B2').numFmt).toBe('@');expect(template.getWorksheet('Instrucciones')).toBeTruthy()
    sheet.getRow(2).values=['Ana conciliada','','ANA.FIXTURE@EXAMPLE.TEST','','',1,'']
    sheet.getRow(3).values=['Bruno de prueba','+12025550123','bruno.fixture@example.test','','Trabajo',1,'No']
    sheet.getRow(4).values=['Fila inválida','123','correo inválido','','',22,'']
    const bytes=await template.xlsx.writeBuffer()
    await page.getByRole('link',{name:'Importar desde Excel',exact:true}).click()
    await page.getByLabel('02 · REVISÁ LA VISTA PREVIA',{exact:true}).setInputFiles({name:'invitados-prueba.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)})
    await expect(page.getByText('VISTA PREVIA · TODAVÍA SIN GUARDAR',{exact:true})).toBeVisible({timeout:20000})
    await expect(page.getByText('Fila 4',{exact:true})).toBeVisible();await expect(page.getByText('Rechazada',{exact:true})).toBeVisible()
    expect((await checked(users[0].sdk.rpc('list_guests',{p_event_id:eventId}))).total).toBe(1)
    if(process.env.JOTOPA_CAPTURE_UI==='1') {await page.locator('#main-content').focus();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(tmpdir(),`jotopa-import-${width}.png`),fullPage:true})}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.getByRole('button',{name:'Importar 2 filas válidas',exact:true}).click()
    await expect(page.getByText('IMPORTACIÓN COMPLETADA',{exact:true})).toBeVisible()
    const database=await checked(users[0].sdk.rpc('list_guests',{p_event_id:eventId}));expect(database.total).toBe(2)
    expect(database.rows.find(g=>g.email==='ana.fixture@example.test').companions_allowed).toBe(0)
    await page.getByRole('link',{name:'Ver invitados',exact:true}).click()
    const exportPending=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar lista filtrada',exact:true}).click()
    const exported=await workbookDownload(await exportPending), exportedSheet=exported.getWorksheet('Invitados')
    expect(exportedSheet.getCell('A2').value).toBe('Ana conciliada');expect(exportedSheet.getCell('B2').value).toBe('+595981123456');expect(exportedSheet.getCell('A3').value).toBe('Bruno de prueba')
    if(process.env.JOTOPA_CAPTURE_UI==='1') {await page.locator('#main-content').focus();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(tmpdir(),`jotopa-guests-${width}.png`),fullPage:true})}
    await page.getByRole('combobox',{name:'Grupo',exact:true}).selectOption('Familia')
    await page.getByRole('button',{name:'Buscar y filtrar',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Ana conciliada',exact:true})).toBeVisible()
    await expect(page.getByRole('heading',{name:'Bruno de prueba',exact:true})).toHaveCount(0)
    await expect(page.getByRole('combobox',{name:'Grupo',exact:true})).toHaveValue('Familia')
    await page.getByRole('combobox',{name:'Grupo',exact:true}).selectOption('')
    await page.getByRole('searchbox',{name:'Buscar',exact:true}).fill('Bruno');await page.getByRole('button',{name:'Buscar y filtrar',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Ana conciliada',exact:true})).toHaveCount(0)
    const bruno=page.getByRole('listitem').filter({has:page.getByRole('heading',{name:'Bruno de prueba',exact:true})})
    await bruno.getByText('Eliminar',{exact:true}).click();await bruno.getByRole('button',{name:'Confirmar baja',exact:true}).click()
    await expect(page.getByText('Invitado eliminado.',{exact:true})).toBeVisible()
    expect((await checked(users[0].sdk.rpc('list_guests',{p_event_id:eventId}))).total).toBe(1)
    for(const account of users.slice(1)) {
      const restricted=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});contexts.push(restricted)
      const tab=await restricted.newPage();await login(tab,account,password);await tab.goto(`/eventos/${eventId}/invitados`)
      if(account.role==='checkin') {
        await expect(tab.getByRole('heading',{name:'Ana conciliada',exact:true})).toBeVisible()
        await expect(tab.getByText('+595981123456',{exact:true})).toHaveCount(0)
        await expect(tab.getByRole('button',{name:/Agregar invitado/})).toHaveCount(0)
        await expect(tab.getByRole('link',{name:'Importar desde Excel',exact:true})).toHaveCount(0)
      } else await expect(tab.getByRole('alert')).toContainText('no tenés permiso')
      await tab.goto(`/eventos/${eventId}/invitados/importar`);await expect(tab.getByRole('alert')).toContainText('no tenés permiso')
      expect(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    }
    expect(exceptions).toHaveLength(0)
  } finally {
    await Promise.all(contexts.map(context=>context.close()))
    if(eventId) sql(`delete from public.events where id='${eventId}';`)
    removeTestUsers(users.map(u=>u.id))
  }
})
