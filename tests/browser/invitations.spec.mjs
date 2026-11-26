import {test,expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {client,sql,removeTestUsers} from '../../scripts/local-test-helpers.mjs'

const checked=async promise=>{const result=await promise;if(result.error)throw new Error(`Delivery browser fixture failed (${result.error.code})`);return result.data}
const login=async(page,email,password)=>{await page.goto('/iniciar-sesion');await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Mis eventos',exact:true})).toBeVisible()}
for(const width of [360,1440])test(`manual invitation queue, personal openings and timeline at ${width}px`,async({browser})=>{
  const users=[],contexts=[],tokens=[],exceptions=[],consoleLines=[],waUrls=[],password=`DeliveryBrowser42-${randomUUID()}`
  let eventId
  try{
    for(const role of ['owner','content']){
      const sdk=client(),email=`jotopa-delivery-browser-${randomUUID()}@example.test`,data=await checked(sdk.auth.signUp({email,password,options:{data:{full_name:`Delivery browser ${role}`}}}));users.push({sdk,email,id:data.user.id})
    }
    const sdk=users[0].sdk
    eventId=await checked(sdk.rpc('create_event',{p_title:'El encuentro de nuestra gente',p_slug:`delivery-browser-${randomUUID()}`,p_type:'other',p_starts_at:new Date(Date.now()+86400000*10).toISOString(),p_timezone:'America/Asuncion'}))
    sql(`update public.events set status='active' where id='${eventId}';insert into public.event_members(event_id,user_id,role) values('${eventId}','${users[1].id}','content');`)
    const ids=[]
    for(const [name,phone,consent] of [['Ana de prueba','+595981123456',true],['Bruno de prueba','+12025550123',true],['Carla sin teléfono',null,true],['Dora con baja',null,true],['Ema sin autorización',null,false]]){
      const id=await checked(sdk.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:name,phone,contact_consent:consent,companions_allowed:1}}));ids.push(id);tokens.push(await checked(sdk.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:id})))
    }
    await checked(client().rpc('guest_invitation',{p_token:tokens[3],p_request:{action:'opt_out'}}))
    const ownerContext=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});contexts.push(ownerContext)
    // Verify the actual target URL and popup without contacting WhatsApp or
    // sending synthetic invitations to real phone numbers.
    await ownerContext.route('https://wa.me/**',route=>{waUrls.push(route.request().url());return route.fulfill({contentType:'text/html',body:'<p>Prueba local de apertura manual. No se envió ningún mensaje.</p>'})})
    const owner=await ownerContext.newPage();owner.setDefaultTimeout(10_000)
    owner.on('pageerror',()=>exceptions.push('Unexpected owner error'));owner.on('console',entry=>consoleLines.push(entry.text()))
    await login(owner,users[0].email,password);await owner.goto(`/eventos/${eventId}`)
    await expect(owner.getByRole('navigation',{name:'Herramientas del evento'})).toBeVisible()
    expect(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await owner.getByRole('link',{name:/Enviar invitaciones/}).click()
    await expect(owner.getByRole('heading',{name:'Ana de prueba',exact:true})).toBeVisible()
    await expect(owner.getByText('3 invitaciones pendientes en total.',{exact:false})).toBeVisible()
    await owner.getByRole('button',{name:/Elegir uno a uno/}).click()
    await expect(owner.getByText('Elegí Revisar',{exact:false})).toBeVisible()
    await owner.getByRole('button',{name:'Revisar invitación de Bruno de prueba'}).click()
    await expect(owner.getByRole('heading',{name:'Bruno de prueba',exact:true})).toBeVisible()
    await owner.getByRole('button',{name:/Todos los pendientes/}).click()
    await expect(owner.getByRole('heading',{name:'Ana de prueba',exact:true})).toBeVisible()
    await expect(owner.getByText('Dora con baja',{exact:true})).toHaveCount(0);await expect(owner.getByText('Ema sin autorización',{exact:true})).toHaveCount(0)
    await owner.getByRole('link',{name:'Plantillas',exact:true}).click();await owner.getByRole('button',{name:'Editar plantilla Una invitación especial',exact:true}).click()
    await owner.getByLabel('Nombre de la plantilla',{exact:true}).fill('Nuestro mensaje')
    await owner.getByLabel('Lugar para este mensaje',{exact:true}).fill('Jardín del encuentro')
    await owner.getByLabel('Mensaje de invitación',{exact:true}).fill('Hola {nombre} 🌿\nNos encontramos el {fecha}.\nLugar: {lugar}\nTu invitación: {link}\nRespondé antes del {fecha_limite}.')
    await owner.getByRole('button',{name:'Guardar plantilla',exact:true}).click();await expect(owner.getByRole('heading',{name:'Nuestro mensaje',exact:true})).toBeVisible()
    if(process.env.JOTOPA_CAPTURE_UI==='1')await owner.screenshot({path:join(tmpdir(),`jotopa-templates-${width}.png`),fullPage:true})
    await owner.getByRole('link',{name:'Cola de envío',exact:true}).click();await expect(owner.getByRole('heading',{name:'Ana de prueba',exact:true})).toBeVisible()
    await owner.getByRole('button',{name:'Copiar mensaje',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'Mensaje copiado.'})).toBeVisible()
    const message=await owner.evaluate(()=>navigator.clipboard.readText())
    expect(message.includes('Hola Ana de prueba')).toBe(true);expect(message.includes('Jardín del encuentro')).toBe(true);expect(message.includes(`/i/${tokens[0]}`)).toBe(true);expect(message.includes('{fecha}')).toBe(false)
    expect(await owner.locator('body').innerText().then(text=>tokens.some(token=>text.includes(token)))).toBe(false)
    const tracking=async index=>(await checked(sdk.rpc('get_guest_invitation_tracking',{p_event_id:eventId,p_guest_ids:[ids[index]]})))[0]
    expect((await tracking(0)).status).toBe('pending')
    if(process.env.JOTOPA_CAPTURE_UI==='1'){await owner.evaluate(()=>window.scrollTo(0,0));await owner.screenshot({path:join(tmpdir(),`jotopa-delivery-${width}.png`),fullPage:true})}
    expect(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await owner.evaluate(()=>{globalThis.testOriginalWindowOpen=window.open;window.open=()=>null})
    await owner.getByRole('button',{name:'Abrir WhatsApp y marcar enviada',exact:true}).click()
    await expect(owner.getByRole('status').filter({hasText:'El navegador bloqueó la pestaña.'})).toBeVisible()
    expect((await tracking(0)).status).toBe('pending');expect(waUrls.length).toBe(0)
    await owner.evaluate(()=>{window.open=globalThis.testOriginalWindowOpen;delete globalThis.testOriginalWindowOpen})
    await owner.getByRole('button',{name:'No se pudo',exact:true}).click();await owner.getByRole('button',{name:'Retomar a Ana de prueba',exact:true}).click()
    await expect(owner.getByText('Persona devuelta a Pendientes.',{exact:true})).toBeVisible();await owner.getByRole('button',{name:'Pendientes',exact:true}).click();await expect(owner.getByRole('heading',{name:'Ana de prueba',exact:true})).toBeVisible()
    await owner.evaluate(()=>{globalThis.testOriginalWindowOpen=window.open;window.open=(...args)=>{const popup=globalThis.testOriginalWindowOpen(...args);setTimeout(()=>popup?.close(),0);return popup}})
    await owner.getByRole('button',{name:'Abrir WhatsApp y marcar enviada',exact:true}).click()
    await expect(owner.getByRole('status').filter({hasText:'La pestaña se cerró antes de abrir WhatsApp.'})).toBeVisible()
    expect((await tracking(0)).status).toBe('pending');expect(waUrls.length).toBe(0)
    await owner.evaluate(()=>{window.open=globalThis.testOriginalWindowOpen;delete globalThis.testOriginalWindowOpen})
    await owner.getByRole('button',{name:'No se pudo',exact:true}).click();await owner.getByRole('button',{name:'Retomar a Ana de prueba',exact:true}).click()
    await expect(owner.getByText('Persona devuelta a Pendientes.',{exact:true})).toBeVisible();await owner.getByRole('button',{name:'Pendientes',exact:true}).click();await expect(owner.getByRole('heading',{name:'Ana de prueba',exact:true})).toBeVisible()
    await owner.getByRole('button',{name:'Abrir WhatsApp y marcar enviada',exact:true}).click();await expect.poll(()=>waUrls.length).toBe(1)
    expect(new URL(waUrls[0]).pathname==='/595981123456').toBe(true);expect(new URL(waUrls[0]).searchParams.get('text')===message.replace(/\r\n?/g,'\n')).toBe(true)
    await expect(owner.getByText('Último intento manual: Ana de prueba',{exact:true})).toBeVisible();expect((await tracking(0)).status).toBe('sent')
    await owner.bringToFront();await owner.getByRole('button',{name:'Deshacer marca de envío',exact:true}).click();await expect(owner.getByRole('heading',{name:'Ana de prueba',exact:true})).toBeVisible();expect((await tracking(0)).status).toBe('pending')
    await owner.getByRole('button',{name:'Abrir WhatsApp y marcar enviada',exact:true}).click();await expect.poll(()=>waUrls.length).toBe(2)
    const guestContext=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});contexts.push(guestContext)
    const guest=await guestContext.newPage();guest.on('pageerror',()=>exceptions.push('Unexpected guest error'));guest.on('console',entry=>consoleLines.push(entry.text()))
    try{await guest.goto(new URL(`/i/${tokens[0]}`,test.info().project.use.baseURL).href)}catch{throw new Error('No se pudo abrir la invitación de prueba.')}
    await expect(guest.getByRole('heading',{name:'El encuentro de nuestra gente',exact:true})).toBeVisible();expect((await tracking(0)).open_count).toBe(1)
    await guest.reload();await expect(guest.getByRole('heading',{name:'El encuentro de nuestra gente',exact:true})).toBeVisible();expect((await tracking(0)).open_count).toBe(1)
    await owner.bringToFront();await owner.getByRole('button',{name:'Deshacer marca de envío',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'Marca manual deshecha.'})).toBeVisible();expect((await tracking(0)).status).toBe('opened')
    await guest.bringToFront();await guest.getByRole('radio',{name:'Sí, asistiré',exact:true}).check();await guest.getByLabel('¿Cuántas personas asistirán en total?',{exact:true}).selectOption('2');await guest.getByRole('button',{name:'Guardar mi respuesta',exact:true}).click();await expect(guest.getByText('Sí, asistiré · 2 personas confirmadas',{exact:true})).toBeVisible();expect((await tracking(0)).status).toBe('responded')
    await owner.bringToFront();await owner.goto(`/eventos/${eventId}/invitados`);await expect(owner.getByText('Respondida',{exact:true})).toBeVisible();await owner.getByRole('button',{name:'Historial de Ana de prueba',exact:true}).click()
    const history=owner.getByRole('dialog');await expect(history.getByText('Apertura del enlace personal',{exact:true})).toBeVisible();await expect(history.getByText('Respuesta de asistencia',{exact:true})).toBeVisible();await expect(history.getByText('Marca de envío deshecha',{exact:true})).toHaveCount(2)
    if(process.env.JOTOPA_CAPTURE_UI==='1')await owner.screenshot({path:join(tmpdir(),`jotopa-timeline-${width}.png`),fullPage:false})
    await history.getByRole('button',{name:'Cerrar',exact:true}).click()
    await owner.goto(`/eventos/${eventId}/invitaciones`);await expect(owner.getByRole('heading',{name:'Bruno de prueba',exact:true})).toBeVisible();await owner.getByRole('button',{name:'Saltar por ahora',exact:true}).click();await expect(owner.getByRole('heading',{name:'Carla sin teléfono',exact:true})).toBeVisible()
    await owner.getByRole('button',{name:'Saltadas',exact:true}).click();await owner.getByRole('button',{name:'Retomar a Bruno de prueba',exact:true}).click();await expect(owner.getByText('Persona devuelta a Pendientes.',{exact:true})).toBeVisible();await owner.getByRole('button',{name:'Pendientes',exact:true}).click();await expect(owner.getByRole('heading',{name:'Bruno de prueba',exact:true})).toBeVisible()
    await owner.getByRole('button',{name:'No se pudo enviar',exact:true}).click();await expect(owner.getByRole('heading',{name:'Carla sin teléfono',exact:true})).toBeVisible();await expect(owner.getByRole('button',{name:'Abrir WhatsApp y marcar enviada',exact:true})).toBeDisabled()
    await owner.getByRole('button',{name:'Copiar enlace',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'Enlace copiado.'})).toBeVisible();expect(await owner.evaluate(()=>navigator.clipboard.readText()).then(text=>text.includes(`/i/${tokens[2]}`))).toBe(true)
    await owner.getByRole('button',{name:'Ya compartí el enlace',exact:true}).click();await expect(owner.getByRole('heading',{name:'Esta cola está al día',exact:true})).toBeVisible();expect((await tracking(2)).status).toBe('sent')
    await owner.getByRole('button',{name:'No se pudo completar el envío',exact:true}).click();await expect(owner.getByText('El intento quedó como No se pudo.',{exact:true})).toBeVisible();expect((await tracking(2)).status).toBe('pending')
    await owner.getByRole('button',{name:'No se pudo',exact:true}).click();await expect(owner.getByText('Bruno de prueba',{exact:true}).filter({visible:true})).toHaveCount(2)
    await expect(owner.getByText('Carla sin teléfono',{exact:true}).filter({visible:true})).toHaveCount(1)
    const restricted=await browser.newContext({viewport:{width,height:900}});contexts.push(restricted);const tab=await restricted.newPage();await login(tab,users[1].email,password)
    for(const suffix of ['invitaciones','invitaciones/plantillas']){await tab.goto(`/eventos/${eventId}/${suffix}`);await expect(tab.getByRole('alert')).toContainText('no tenés permiso')}
    expect(tokens.some(token=>consoleLines.some(line=>line.includes(token)))).toBe(false);expect(exceptions).toHaveLength(0)
  }finally{
    await Promise.allSettled(contexts.map(context=>context.close()))
    if(eventId)sql(`delete from public.events where id='${eventId}';`)
    removeTestUsers(users.map(user=>user.id))
  }
})
