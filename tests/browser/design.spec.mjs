import {test,expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {client,sql,removeTestUsers} from '../../scripts/local-test-helpers.mjs'
import {fixturePhoto,cleanupDesign} from '../../scripts/design-test-helpers.mjs'

const checked=async promise=>{const result=await promise;if(result.error)throw new Error(`Visual invitation fixture failed (${result.error.code??'request'})`);return result.data}
const options=[{id:'romantic',label:'Entre nosotros',names:'Lucía & Mateo',photo:'portrait',eyebrow:'JUNTOS, DONDE QUEREMOS ESTAR'},{id:'festive',label:'Que sea inolvidable',names:'Sofía · 30',photo:'celebration',eyebrow:'UN NUEVO AÑO. UNA GRAN CELEBRACIÓN.'},{id:'minimal',label:'Lo esencial',names:'Lucía & Mateo',photo:'couple',eyebrow:'LA ALEGRÍA DE ENCONTRARNOS'}]
for(const option of options)for(const width of [360,1440])test(`visual invitation ${option.id}: editor, private photos, publish and RSVP at ${width}px`,async({browser})=>{
  test.setTimeout(90_000)
  const sdk=client(),users=[],contexts=[],exceptions=[],logs=[],requestedPhotos=new Set()
  let eventId,token
  try{
    const email=`jotopa-design-browser-${randomUUID()}@example.test`,password=`VisualDesign42-${randomUUID()}`
    const account=await checked(sdk.auth.signUp({email,password,options:{data:{full_name:'Anfitrión de revisión visual'}}}));users.push(account.user.id)
    eventId=await checked(sdk.rpc('create_event',{p_title:'Revisión de invitación visual',p_slug:`design-browser-${randomUUID()}`,p_type:option.id==='festive'?'birthday':'wedding',p_starts_at:new Date(Date.now()+20*86400000).toISOString(),p_timezone:'America/Asuncion'}))
    sql(`update public.events set status='active',session_opens_at=now()-interval '1 day',session_closes_at=now()+interval '25 days',rsvp_deadline=now()+interval '15 days' where id='${eventId}';`)
    const guestId=await checked(sdk.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Camila',companions_allowed:2,contact_consent:true}}))
    token=await checked(sdk.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestId}))
    const ownerContext=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});contexts.push(ownerContext)
    const owner=await ownerContext.newPage();owner.setDefaultTimeout(15_000)
    owner.on('pageerror',()=>exceptions.push('Unexpected editor error'));owner.on('console',entry=>logs.push(entry.text()))
    await owner.goto('/iniciar-sesion');await owner.getByLabel('Correo electrónico',{exact:true}).fill(email);await owner.getByLabel('Contraseña',{exact:true}).fill(password);await owner.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(owner.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible()
    await owner.goto(`/eventos/${eventId}`);await owner.getByRole('link',{name:'Diseñar invitación',exact:true}).click();await expect(owner.getByRole('heading',{name:'Un encuentro que se siente.',exact:true})).toBeVisible()
    await owner.getByText(option.label,{exact:true}).click();await owner.getByLabel('Nombres o título de la invitación',{exact:true}).fill(option.names);await owner.getByLabel('Frase breve de portada',{exact:true}).fill(option.eyebrow)
    if(option.id==='festive')await owner.getByTitle('Noche y terracota',{exact:true}).click()
    if(option.id==='minimal')await owner.getByLabel('Combinación tipográfica',{exact:true}).selectOption('editorial')
    await owner.getByLabel('Mensaje de bienvenida',{exact:true}).fill('Queremos regalarnos un día para estar cerca, compartir la mesa y celebrar todo lo que nos une. Nos encantaría que seas parte de este recuerdo.')
    await owner.getByLabel('Vestimenta sugerida',{exact:true}).fill('Elegante y cómodo. Vení con ganas de celebrar.')
    await owner.getByRole('textbox',{name:'Información adicional',exact:true}).fill('Llegá unos minutos antes para disfrutar el encuentro desde el comienzo. Si necesitás algo, escribinos por el medio en que recibiste tu invitación.')
    await owner.getByLabel('Mensaje de cierre',{exact:true}).fill('Lo mejor de este día será compartirlo con vos.')
    await owner.getByRole('checkbox',{name:'Vestimenta',exact:true}).check();await owner.getByRole('checkbox',{name:'Información adicional',exact:true}).check()
    await owner.getByLabel('Descripción de la nueva fotografía',{exact:true}).fill('Fotografía de portada para la revisión visual')
    await owner.getByLabel('Foto de portada',{exact:true}).setInputFiles({name:'cover.jpg',mimeType:'image/jpeg',buffer:await fixturePhoto(owner,option.photo)})
    await expect(owner.getByText('Fotografía guardada de forma privada.',{exact:false})).toBeVisible()
    await owner.getByLabel('Descripción de la nueva fotografía',{exact:true}).fill('Un recuerdo del encuentro')
    await owner.getByLabel('Foto para la galería',{exact:true}).setInputFiles({name:'gallery.jpg',mimeType:'image/jpeg',buffer:await fixturePhoto(owner,'couple')})
    await expect(owner.getByLabel('Foto 1 · pie de foto',{exact:true})).toBeVisible();await owner.getByLabel('Foto 1 · pie de foto',{exact:true}).fill('Los pequeños momentos hacen una gran historia.')
    await owner.getByRole('button',{name:'Agregar momento',exact:true}).click();await owner.getByLabel('Nombre del momento 1',{exact:true}).fill(option.id==='festive'?'Nos encontramos':'Ceremonia');await owner.getByLabel('Lugar 1',{exact:true}).fill('Jardín de los encuentros');await owner.getByLabel('Dirección 1',{exact:true}).fill('Asunción, Paraguay')
    await owner.getByRole('button',{name:'Agregar momento',exact:true}).click();await owner.getByLabel('Nombre del momento 2',{exact:true}).fill('Celebración');await owner.getByLabel('Lugar 2',{exact:true}).fill('Salón del jardín');await owner.getByLabel('Dirección 2',{exact:true}).fill('Asunción, Paraguay')
    await owner.getByRole('checkbox',{name:'Cuenta regresiva',exact:true}).uncheck();await owner.getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(owner.getByText('Borrador guardado.',{exact:false})).toBeVisible()
    await owner.reload();await expect(owner.getByLabel('Nombres o título de la invitación',{exact:true})).toHaveValue(option.names);await expect(owner.getByRole('checkbox',{name:'Cuenta regresiva',exact:true})).not.toBeChecked()
    await owner.getByRole('checkbox',{name:'Cuenta regresiva',exact:true}).check();await owner.getByRole('button',{name:'Subir Información adicional',exact:true}).click()
    await owner.getByRole('button',{name:'Vista previa',exact:true}).first().click();const preview=owner.getByRole('dialog');await expect(preview.locator(`.iv-${option.id}`)).toBeVisible();await expect(preview.getByText('Nombre del invitado,',{exact:true})).toBeVisible()
    await preview.getByRole('button',{name:'Escritorio',exact:true}).click();expect(await preview.locator('.iv').evaluate(element=>element.clientWidth)).toBe(1200)
    await preview.getByRole('button',{name:'Celular · 360 px',exact:true}).click();expect(await preview.locator('.iv').evaluate(element=>element.clientWidth<=360)).toBe(true)
    await preview.getByRole('button',{name:'Cerrar vista previa',exact:true}).click()
    const tracking=async()=>(await checked(sdk.rpc('get_guest_invitation_tracking',{p_event_id:eventId,p_guest_ids:[guestId]})))[0]
    expect((await tracking()).open_count).toBe(0)
    await owner.getByRole('button',{name:'Guardar y publicar',exact:true}).click();await expect(owner.getByText('Invitación publicada.',{exact:false})).toBeVisible()
    const stored=await checked(sdk.from('event_invitation_designs').select('published').eq('event_id',eventId).single())
    expect(stored.published.sections.findIndex(section=>section.id==='details')<stored.published.sections.findIndex(section=>section.id==='gallery')).toBe(true)
    expect(await checked(sdk.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestId})).then(value=>value===token)).toBe(true)
    const publicContext=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});contexts.push(publicContext)
    const guest=await publicContext.newPage();guest.setDefaultTimeout(15_000);guest.on('pageerror',()=>exceptions.push('Unexpected invitation error'));guest.on('console',entry=>logs.push(entry.text()))
    guest.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/storage/v1/object/sign/event-assets/'))requestedPhotos.add(url.pathname.split('/').at(-2))})
    try{await guest.goto(new URL(`/i/${token}`,test.info().project.use.baseURL).href)}catch{throw new Error('Could not open personal invitation')}
    await expect(guest.getByRole('heading',{name:option.names,exact:true})).toBeVisible();await expect(guest.getByText('Camila,',{exact:true})).toBeVisible()
    await expect.poll(()=>guest.locator('.iv-hero img').evaluateAll(images=>images.length===1&&images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true)
    expect((await tracking()).open_count).toBe(1)
    await guest.evaluate(()=>document.fonts.ready)
    expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    const imageInfo=await guest.locator('.iv-hero img').evaluate(image=>({width:image.naturalWidth,source:image.currentSrc.includes('small.webp')?'small':'large',priority:image.fetchPriority}))
    expect(imageInfo.priority).toBe('high');if(width===360)expect(imageInfo.source).toBe('small')
    expect(requestedPhotos.has(stored.published.gallery[0].asset_id)).toBe(false)
    await expect(guest.locator('.iv-gallery img')).toHaveAttribute('loading','lazy')
    expect(await guest.locator('.iv-hero-copy,.iv-minimal-heading').first().evaluate(element=>getComputedStyle(element).animationName)).toBe('none')
    if(process.env.JOTOPA_CAPTURE_VISUALS==='1'){
      await mkdir('artifacts/invitaciones',{recursive:true})
      const actualSource=await guest.locator('.iv-hero img').evaluate(image=>image.currentSrc),imageResponse=await fetch(actualSource)
      expect(imageResponse.ok).toBe(true)
      const actualBytes=(await imageResponse.arrayBuffer()).byteLength
      await writeFile(`artifacts/invitaciones/performance-${option.id}-${width}.json`,JSON.stringify({template:option.id,viewport:width,heroVariant:imageInfo.source,heroNaturalWidth:imageInfo.width,heroBytes:actualBytes,lazyGalleryInitiallyDeferred:true},null,2)+'\n')
      await guest.screenshot({path:`artifacts/invitaciones/${option.id}-${width}-portada.png`})
    }
    const maps=guest.getByRole('link',{name:'Cómo llegar',exact:true}).first();expect(new URL(await maps.getAttribute('href')).hostname).toBe('www.google.com')
    await guest.locator('#iv-rsvp').scrollIntoViewIfNeeded();await guest.getByRole('radio',{name:'Sí, asistiré',exact:true}).check();await guest.getByLabel('¿Cuántas personas asistirán en total?',{exact:true}).selectOption('3')
    expect(await guest.getByLabel('¿Cuántas personas asistirán en total?',{exact:true}).locator('option').count()).toBe(3)
    const before=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'read'}}))
    const excessive=await checked(client().rpc('guest_invitation',{p_token:token,p_request:{action:'respond',response:'yes',companions:3,expected_version:before.guest.version}}));expect(excessive.code).toBe('invalid_companions')
    await guest.getByRole('button',{name:'Guardar mi respuesta',exact:true}).click();await expect(guest.getByText('Sí, asistiré · 3 personas confirmadas',{exact:true})).toBeVisible();expect((await tracking()).status).toBe('responded')
    const history=await checked(sdk.rpc('get_guest_invitation_history',{p_event_id:eventId,p_guest_id:guestId}));expect(history.rows.some(row=>row.type==='opened')).toBe(true);expect(history.rows.some(row=>row.type==='rsvp')).toBe(true)
    await guest.getByRole('radio',{name:'No asistiré',exact:true}).check();await guest.getByRole('button',{name:'Actualizar mi respuesta',exact:true}).click();await expect(guest.getByText('No asistiré',{exact:true}).filter({visible:true})).toHaveCount(2)
    expect(requestedPhotos.has(stored.published.gallery[0].asset_id)).toBe(true)
    if(process.env.JOTOPA_CAPTURE_VISUALS==='1'){
      for(let index=0;index<12;index++){await guest.evaluate(()=>scrollBy(0,800));await guest.waitForTimeout(60)}
      await guest.evaluate(()=>scrollTo(0,0));await guest.waitForTimeout(150)
      await guest.screenshot({path:`artifacts/invitaciones/${option.id}-${width}.png`,fullPage:true})
      await owner.screenshot({path:`artifacts/invitaciones/editor-${width}.png`,fullPage:true})
    }
    await owner.getByRole('checkbox',{name:'Vestimenta',exact:true}).uncheck();await owner.getByRole('button',{name:'Guardar y publicar',exact:true}).click();await expect(owner.getByText('Invitación publicada.',{exact:false})).toBeVisible()
    await guest.reload();await expect(guest.getByRole('heading',{name:option.names,exact:true})).toBeVisible();await expect(guest.getByRole('heading',{name:'Un detalle más.',exact:true})).toHaveCount(0)
    await owner.getByLabel('Nombres o título de la invitación',{exact:true}).fill('BORRADOR SIN PUBLICAR');await owner.getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(owner.getByText('Borrador guardado.',{exact:false})).toBeVisible()
    await guest.reload();await expect(guest.getByRole('heading',{name:option.names,exact:true})).toBeVisible();expect((await tracking()).open_count).toBe(1)
    expect(logs.some(line=>line.includes(token))).toBe(false);expect(exceptions).toHaveLength(0)
  }finally{
    await Promise.allSettled(contexts.map(context=>context.close()))
    if(eventId)await cleanupDesign(sdk,eventId)
    removeTestUsers(users)
  }
})
