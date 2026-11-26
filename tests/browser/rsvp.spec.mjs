import {test,expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PNG} from 'pngjs'
import {BinaryBitmap,HybridBinarizer,RGBLuminanceSource,QRCodeReader,DecodeHintType} from '@zxing/library'
import {client,sql,removeTestUsers} from '../../scripts/local-test-helpers.mjs'

const checked=async promise=>{const r=await promise;if(r.error) throw new Error(`RSVP browser fixture failed (${r.error.code})`);return r.data}
const openPersonal=async(page,url)=>{try{
  // The QR retains VITE_APP_URL. Local build tests serve the same invitation
  // path at their temporary preview origin, without changing project settings.
  const path=new URL(url).pathname
  await page.goto(new URL(path,test.info().project.use.baseURL).href)
}catch{throw new Error('No se pudo abrir la invitación personal.')}}
const decodeQr=buffer=>{
  const png=PNG.sync.read(buffer),pixels=new Uint8ClampedArray(png.width*png.height)
  for(let i=0;i<pixels.length;i++)pixels[i]=(png.data[i*4]+2*png.data[i*4+1]+png.data[i*4+2])>>2
  const image=new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,png.width,png.height)))
  // This is a pristine generated PNG, not a camera frame. Some random payload
  // masks confuse the perspective detector; pure mode still decodes and checks
  // the actual QR modules/error correction and must recover the exact URL.
  try{return new QRCodeReader().decode(image).getText()}
  catch{return new QRCodeReader().decode(image,new Map([[DecodeHintType.PURE_BARCODE,true]])).getText()}
}

for(const width of [360,1440]) test(`personal invitation and real RSVP/QR lifecycle at ${width}px`,async({browser})=>{
  const accounts=[],contexts=[],exceptions=[],logs=[],referrers=[]
  let eventId,token,oldToken
  try {
    const sdk=client(),email=`jotopa-rsvp-browser-${randomUUID()}@example.test`,password=`RsvpBrowser42-${randomUUID()}`
    const signup=await checked(sdk.auth.signUp({email,password,options:{data:{full_name:'Anfitriona RSVP'}}}));accounts.push(signup.user.id)
    eventId=await checked(sdk.rpc('create_event',{p_title:'Un encuentro para recordar',p_slug:`rsvp-browser-${randomUUID()}`,p_type:'wedding',p_timezone:'UTC',p_starts_at:new Date(Date.now()+86400000*10).toISOString()}))
    const guestId=await checked(sdk.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Lucía de prueba',email:'lucia.fixture@example.test',phone:'+595981123456',companions_allowed:2}}))
    const otherId=await checked(sdk.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Persona que no debe verse',email:'private.fixture@example.test'}}))
    const ownerContext=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});contexts.push(ownerContext)
    const guestContext=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});contexts.push(guestContext)
    const owner=await ownerContext.newPage(),guest=await guestContext.newPage()
    owner.setDefaultTimeout(10_000);guest.setDefaultTimeout(10_000)
    for(const page of [owner,guest]){page.on('pageerror',()=>exceptions.push('Browser error'));page.on('console',message=>logs.push(message.text()))}
    guest.on('request',request=>referrers.push(request.headers().referer ?? ''))
    await owner.goto('/iniciar-sesion');await owner.getByLabel('Correo electrónico',{exact:true}).fill(email);await owner.getByLabel('Contraseña',{exact:true}).fill(password);await owner.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(owner.getByRole('heading',{name:'Mis eventos',exact:true})).toBeVisible()
    await owner.goto(`/eventos/${eventId}/editar`);await owner.getByLabel('Estado',{exact:true}).selectOption('active')
    await owner.getByLabel('Fecha límite de confirmación',{exact:true}).fill(new Date(Date.now()+3600000).toISOString().slice(0,16))
    await owner.getByRole('button',{name:'Guardar evento',exact:true}).click();await expect(owner.getByRole('heading',{name:'Un encuentro para recordar',exact:true})).toBeVisible()
    await owner.getByText('Acceso a las invitaciones personales',{exact:true}).click()
    await owner.getByLabel('Apertura del acceso',{exact:true}).fill(new Date(Date.now()-600000).toISOString().slice(0,16));await owner.getByLabel('Cierre del acceso',{exact:true}).fill(new Date(Date.now()+86400000*2).toISOString().slice(0,16))
    await owner.getByRole('button',{name:'Guardar período de acceso',exact:true}).click();await expect(owner.getByText('Período de acceso actualizado.',{exact:true})).toBeVisible()
    await owner.getByRole('link',{name:'Invitados',exact:true}).click();await owner.getByRole('button',{name:'Enlace y QR de Lucía de prueba',exact:true}).click()
    const dialog=owner.getByRole('dialog');await expect(dialog.getByRole('img',{name:'Código QR de la invitación personal',exact:true})).toBeVisible()
    await dialog.getByRole('button',{name:'Copiar enlace',exact:true}).click();await expect(dialog.getByText('Enlace copiado.',{exact:true})).toBeVisible()
    const link=await owner.evaluate(()=>navigator.clipboard.readText());token=new URL(link).pathname.split('/').at(-1)
    expect(/^[a-f0-9]{64}$/.test(token)).toBe(true)
    const pending=owner.waitForEvent('download');await dialog.getByRole('link',{name:'Descargar QR',exact:true}).click();const download=await pending
    expect(decodeQr(await readFile(await download.path()))===link).toBe(true);await download.delete()
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).click()
    await openPersonal(guest,link)
    await expect(guest.getByRole('heading',{name:'Un encuentro para recordar',exact:true})).toBeVisible()
    await expect(guest.getByText('Lucía de prueba, te invitamos a',{exact:true})).toBeVisible()
    await expect(guest.getByText('Persona que no debe verse',{exact:true})).toHaveCount(0)
    await expect(guest.getByText('lucia.fixture@example.test',{exact:true})).toHaveCount(0)
    await expect(guest.getByRole('button',{name:'Iniciar sesión',exact:true})).toHaveCount(0)
    await guest.getByRole('radio',{name:'Sí, asistiré',exact:true}).check();await guest.getByLabel('¿Cuántas personas asistirán en total?',{exact:true}).selectOption('3')
    expect(await guest.getByLabel('¿Cuántas personas asistirán en total?',{exact:true}).locator('option').count()).toBe(3)
    await guest.getByRole('button',{name:'Guardar mi respuesta',exact:true}).click();await expect(guest.getByText('Sí, asistiré · 3 personas confirmadas',{exact:true})).toBeVisible()
    await guest.reload();await expect(guest.getByText('Sí, asistiré · 3 personas confirmadas',{exact:true})).toBeVisible()
    const first=await checked(sdk.from('guests').select('rsvp_status,companions_confirmed,rsvp_at').eq('id',guestId).single());expect(first.rsvp_status).toBe('yes');expect(first.companions_confirmed).toBe(2);expect(Math.abs(Date.parse(first.rsvp_at)-Date.now())<15000).toBe(true)
    if(process.env.JOTOPA_CAPTURE_UI==='1'){await guest.evaluate(()=>window.scrollTo(0,0));await guest.screenshot({path:join(tmpdir(),`jotopa-invitation-${width}.png`),fullPage:true})}
    expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await guest.getByRole('radio',{name:'No asistiré',exact:true}).check();await guest.getByRole('button',{name:'Actualizar mi respuesta',exact:true}).click();await expect(guest.getByText('No asistiré',{exact:true}).filter({visible:true})).toHaveCount(2)
    await expect(guest.getByRole('radio',{name:'Quizás',exact:true})).toHaveCount(0);await guest.getByRole('radio',{name:'Sí, asistiré',exact:true}).check();await guest.getByLabel('¿Cuántas personas asistirán en total?',{exact:true}).selectOption('2');await guest.getByRole('button',{name:'Actualizar mi respuesta',exact:true}).click()
    await expect(guest.getByText('Sí, asistiré · 2 personas confirmadas',{exact:true})).toBeVisible()
    await guest.getByRole('button',{name:'No quiero recibir más recordatorios de este evento',exact:true}).click();await expect(guest.getByText('Tu preferencia quedó guardada: no recibir más recordatorios de este evento.',{exact:true})).toBeVisible()
    expect((await checked(sdk.from('guests').select('rsvp_status,companions_confirmed,opted_out').eq('id',guestId).single())).opted_out).toBe(true)
    expect((await checked(sdk.from('guests').select('rsvp_status').eq('id',otherId).single())).rsvp_status).toBe('pending')
    await owner.getByRole('button',{name:'Actualizar lista',exact:true}).click();await expect(owner.getByText('RSVP: Sí, asistiré · 2 personas confirmadas',{exact:true})).toBeVisible();await expect(owner.getByText('No quiere más recordatorios',{exact:true})).toBeVisible()
    if(process.env.JOTOPA_CAPTURE_UI==='1'){await owner.evaluate(()=>window.scrollTo(0,0));await owner.screenshot({path:join(tmpdir(),`jotopa-rsvp-host-${width}.png`),fullPage:true})}
    await owner.getByRole('button',{name:'Enlace y QR de Lucía de prueba',exact:true}).click();await owner.getByText('Regenerar enlace personal',{exact:true}).click();await owner.getByRole('button',{name:'Confirmar nuevo enlace',exact:true}).click();await expect(owner.getByText('Enlace regenerado. El enlace y el QR anteriores dejaron de funcionar.',{exact:true})).toBeVisible()
    await owner.getByRole('button',{name:'Copiar enlace',exact:true}).click();const next=await owner.evaluate(()=>navigator.clipboard.readText());oldToken=token;token=new URL(next).pathname.split('/').at(-1);expect(next===link).toBe(false)
    await openPersonal(guest,link);await expect(guest.getByRole('alert')).toContainText('Este enlace no está disponible')
    await openPersonal(guest,next);await expect(guest.getByRole('heading',{name:'Un encuentro para recordar',exact:true})).toBeVisible()
    sql(`update public.events set rsvp_deadline=now()-interval '1 second' where id='${eventId}';`)
    await guest.reload();await expect(guest.getByText(/El plazo para responder terminó/)).toBeVisible();await expect(guest.getByRole('radio')).toHaveCount(0)
    sql(`update public.events set session_closes_at=now()-interval '1 second',session_opens_at=now()-interval '1 day' where id='${eventId}';`)
    await guest.reload();await expect(guest.getByRole('alert')).toContainText('Este enlace no está disponible')
    expect(logs.some(line=>line.includes(token)||line.includes(oldToken))).toBe(false)
    expect(referrers.some(value=>value.includes('/i/'))).toBe(false)
    expect(exceptions).toHaveLength(0)
  } finally {
    await Promise.allSettled(contexts.map(context=>context.close()))
    if(eventId) sql(`delete from public.events where id='${eventId}';`)
    removeTestUsers(accounts)
  }
})
