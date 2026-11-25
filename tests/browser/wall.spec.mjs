import {test,expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {client,sql,removeTestUsers} from '../../scripts/local-test-helpers.mjs'
import {cleanupDesign,designFixture,fixturePhoto,uploadFixture,webpFixtures} from '../../scripts/design-test-helpers.mjs'
import {checked,cleanupWall,beginWall,wall,wallAudioForm} from '../../scripts/wall-test-helpers.mjs'
import {encodeWav} from '../../src/features/wall/wav.ts'

test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}})
const login=async(page,email,password)=>{await page.goto('/iniciar-sesion');await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Mi perfil',exact:true})).toBeVisible()}
const layouts=[{template:'romantic',name:'Entre nosotros',names:'Lucía & Mateo',palette:'olive',font_pair:'classic'},{template:'festive',name:'Que sea inolvidable',names:'Valentina · 15 años',palette:'rose',font_pair:'modern'},{template:'minimal',name:'Lo esencial',names:'Celebrar lo que somos',palette:'night',font_pair:'editorial'}]

for(const layout of layouts)for(const width of [360,1440])test(`stage C: ${layout.template}, multimedia, real MediaRecorder and moderation at ${width}px`,async({browser})=>{
  test.setTimeout(150000)
  const users=[],contexts=[],exceptions=[],consoleLines=[],personalReferrers=[];const password=`WallBrowser42-${randomUUID()}`;let eventId,personalToken
  try{
    for(const role of ['owner','moderator','viewer']){const sdk=client(),email=`jotopa-wall-browser-${randomUUID()}@example.test`,signup=await checked(sdk.auth.signUp({email,password}));users.push({sdk,email,id:signup.user.id,role})}
    const sdk=users[0].sdk
    eventId=await checked(sdk.rpc('create_event',{p_title:layout.names,p_slug:`wall-browser-${randomUUID()}`,p_type:'wedding',p_starts_at:new Date(Date.now()+10*86400000).toISOString(),p_rsvp_deadline:new Date(Date.now()+4*86400000).toISOString(),p_timezone:'America/Asuncion'}))
    sql(`update public.events set status='active' where id='${eventId}';insert into public.event_members(event_id,user_id,role) values('${eventId}','${users[1].id}','moderator'),('${eventId}','${users[2].id}','viewer');`)
    const guestId=await checked(sdk.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Familia González',party_size:3}})),individualId=await checked(sdk.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'María López',party_size:1}}))
    personalToken=await checked(sdk.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestId}));const individualToken=await checked(sdk.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:individualId}))
    const hostContext=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(hostContext);const host=await hostContext.newPage();host.on('pageerror',()=>exceptions.push('Host exception'));host.on('console',message=>consoleLines.push(message.text()));await login(host,users[0].email,password)
    const images=await webpFixtures(host),cover=(await checked(uploadFixture(sdk,eventId,images,'Retrato de revisión de buenos deseos'))).id
    await checked(sdk.rpc('save_invitation_design',{p_event_id:eventId,p_design:{...designFixture(layout.names),template:layout.template,palette:layout.palette,font_pair:layout.font_pair,version:1,cover_asset_id:cover},p_expected_revision:0}));await checked(sdk.rpc('publish_invitation_design',{p_event_id:eventId,p_expected_revision:1}))
    const guestContext=await browser.newContext({viewport:{width,height:1000},permissions:['microphone'],reducedMotion:'reduce'});contexts.push(guestContext);const guest=await guestContext.newPage();guest.on('pageerror',()=>exceptions.push('Guest exception'));guest.on('console',message=>consoleLines.push(message.text()));guest.on('request',request=>{if((request.headers().referer??'').includes('/i/'))personalReferrers.push(request.resourceType())})
    await guest.goto(`/i/${personalToken}`);await expect(guest.getByRole('heading',{name:'Dejá tus buenos deseos.',exact:false})).toBeVisible();await expect(guest.getByText('Sin respuesta',{exact:true})).toBeVisible()
    await guest.getByLabel('Tu mensaje de buenos deseos',{exact:true}).fill('Que este encuentro sea el comienzo de muchos recuerdos hermosos. ¡Los queremos!')
    await guest.getByRole('button',{name:'Enviar buenos deseos',exact:false}).click();await expect(guest.getByText('¡Gracias por compartir tus buenos deseos! Tu mensaje será revisado antes de publicarse',{exact:true})).toBeVisible();await expect(guest.locator('.ww-bubble')).toHaveCount(0)
    await guest.getByRole('radio',{name:'No asistiré',exact:true}).check();await guest.getByRole('button',{name:'Guardar mi respuesta',exact:true}).click();await expect(guest.getByRole('button',{name:'Actualizar mi respuesta',exact:true})).toBeVisible()
    sql(`update public.events set rsvp_deadline=now()-interval '1 second' where id='${eventId}';`);await guest.reload();await expect(guest.getByText(/El plazo para responder terminó/)).toBeVisible();await expect(guest.getByRole('button',{name:'Enviar buenos deseos',exact:false})).toBeEnabled()
    await guest.getByLabel('¿Quién de esta invitación escribe?',{exact:false}).fill('Ana González')
    await guest.getByLabel('Tu mensaje de buenos deseos',{exact:true}).fill('Aunque hoy estemos lejos, celebramos con ustedes. Una foto y nuestra voz para acompañarlos. ♡')
    await guest.getByLabel('Adjuntar fotografías',{exact:true}).setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('Not an image')});await expect(guest.getByRole('alert').filter({hasText:'Elegí una foto'})).toBeVisible()
    const photo=await fixturePhoto(host)
    await guest.getByLabel('Adjuntar fotografías',{exact:true}).setInputFiles({name:'recuerdo.jpg',mimeType:'image/jpeg',buffer:photo});await expect(guest.getByAltText('Vista previa de la fotografía 1',{exact:true})).toBeVisible();await guest.getByRole('button',{name:'Quitar fotografía 1',exact:true}).click();await expect(guest.getByAltText('Vista previa de la fotografía 1',{exact:true})).toHaveCount(0)
    await guest.getByLabel('Adjuntar fotografías',{exact:true}).setInputFiles({name:'recuerdo.jpg',mimeType:'image/jpeg',buffer:photo});await expect(guest.getByAltText('Vista previa de la fotografía 1',{exact:true})).toBeVisible()
    if(layout.template==='romantic'){
      await guest.getByLabel('Adjuntar fotografías',{exact:true}).setInputFiles(Array.from({length:3},(_,index)=>({name:`extra-${index}.jpg`,mimeType:'image/jpeg',buffer:photo})));await expect(guest.getByRole('alert').filter({hasText:'hasta 3 fotografías'})).toBeVisible()
      await guest.getByLabel('Adjuntar archivo de audio',{exact:true}).setInputFiles({name:'nota.wav',mimeType:'audio/wav',buffer:Buffer.from(encodeWav(new Float32Array(16000)))});await expect(guest.getByLabel('Vista previa de tu nota de voz',{exact:true})).toBeVisible();await guest.getByRole('button',{name:'Eliminar audio y grabar otro',exact:true}).click()
      await guest.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async()=>{navigator.mediaDevices.getUserMedia=original;throw new DOMException('Denied test microphone','NotAllowedError')}})
      await guest.getByRole('button',{name:'Grabar nota de voz',exact:false}).click();await expect(guest.getByRole('alert').filter({hasText:'No pudimos acceder al micrófono'})).toBeVisible()
    }
    // Real browser MediaRecorder + virtual microphone, not a mocked recording.
    await guest.getByRole('button',{name:'Grabar nota de voz',exact:false}).click();await expect(guest.getByRole('button',{name:'Detener grabación',exact:false})).toBeVisible();await expect(guest.getByText('1 s · grabando',{exact:true})).toBeVisible();await guest.getByRole('button',{name:'Detener grabación',exact:false}).click()
    const preview=guest.getByLabel('Vista previa de tu nota de voz',{exact:true});await expect(preview).toBeVisible();await preview.evaluate(async element=>{await element.play()});await expect.poll(()=>preview.evaluate(element=>element.currentTime)).toBeGreaterThan(0);await preview.evaluate(element=>element.pause())
    await guest.getByRole('button',{name:'Eliminar audio y grabar otro',exact:true}).click();await expect(preview).toHaveCount(0)
    await guest.getByRole('button',{name:'Grabar nota de voz',exact:false}).click();await expect(guest.getByText('1 s · grabando',{exact:true})).toBeVisible();await guest.getByRole('button',{name:'Detener grabación',exact:false}).click();await expect(preview).toBeVisible()
    await guest.getByRole('button',{name:'Enviar buenos deseos',exact:false}).click();await expect(guest.getByText('¡Gracias por compartir tus buenos deseos! Tu mensaje será revisado antes de publicarse',{exact:true})).toBeVisible();await expect(guest.locator('.ww-bubble')).toHaveCount(0)
    await host.goto(`/eventos/${eventId}`);await host.getByRole('link',{name:'Buenos deseos',exact:true}).click();await expect(host.getByRole('heading',{name:'Buenos deseos',exact:true})).toBeVisible();await expect(host.locator('.ww-moderation-card')).toHaveCount(2)
    await host.getByText('Período de participación y límites',{exact:true}).click();await host.getByLabel('Duración máxima de audio (segundos)',{exact:true}).fill('30');await host.getByRole('button',{name:'Guardar participación',exact:true}).click();await expect(host.getByText('Configuración guardada.',{exact:true})).toBeVisible()
    expect((await checked(sdk.from('event_wall_settings').select('audio_max_seconds').eq('event_id',eventId).single())).audio_max_seconds).toBe(30);await host.getByText('Período de participación y límites',{exact:true}).click()
    const audioCard=host.locator('.ww-moderation-card').filter({hasText:'Ana González'});await expect(audioCard.getByText('Nombre declarado · invitación de Familia González',{exact:true})).toBeVisible();await expect(audioCard.getByRole('img',{name:'Fotografía compartida por Ana González',exact:true})).toBeVisible();const hostAudio=audioCard.getByLabel('Nota de voz de Ana González',{exact:true});await expect(hostAudio).toBeVisible();await hostAudio.evaluate(async element=>{await element.play()});await expect.poll(()=>hostAudio.evaluate(element=>element.currentTime)).toBeGreaterThan(0);await hostAudio.evaluate(element=>element.pause())
    await mkdir('artifacts/etapa-c',{recursive:true});if(layout.template==='romantic'){await host.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0)});await host.screenshot({path:`artifacts/etapa-c/moderacion-${width}.png`,fullPage:true})}
    await audioCard.getByRole('button',{name:'Aprobar',exact:true}).click();await expect(host.locator('.ww-moderation-card')).toHaveCount(1);await host.getByRole('button',{name:'Aprobar',exact:true}).click();await expect(host.locator('.ww-moderation-card')).toHaveCount(0)
    await guest.getByRole('button',{name:'Actualizar conversación',exact:true}).click();await expect(guest.locator('.ww-bubble')).toHaveCount(2);await expect(guest.getByText('Nombre declarado · invitación de Familia González',{exact:true})).toBeVisible();await expect(guest.getByLabel('Nota de voz de Ana González',{exact:true})).toBeVisible();await expect(guest.getByRole('img',{name:'Fotografía compartida por Ana González',exact:true})).toBeVisible()
    await expect.poll(()=>guest.getByRole('img',{name:'Fotografía compartida por Ana González',exact:true}).evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true)
    const publishedAudio=guest.getByLabel('Nota de voz de Ana González',{exact:true});await publishedAudio.evaluate(async element=>{await element.play()});await expect.poll(()=>publishedAudio.evaluate(element=>element.currentTime)).toBeGreaterThan(0);await publishedAudio.evaluate(element=>element.pause())
    await guest.locator('#buenos-deseos').screenshot({path:`artifacts/etapa-c/${layout.template}-${width}-buenos-deseos.png`})
    expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await host.getByLabel('Estado de publicaciones',{exact:true}).selectOption('approved');await expect(host.locator('.ww-moderation-card')).toHaveCount(2);await host.locator('.ww-moderation-card').filter({hasText:'Ana González'}).getByRole('button',{name:'Ocultar',exact:true}).click();await expect(host.locator('.ww-moderation-card')).toHaveCount(1);await guest.getByRole('button',{name:'Actualizar conversación',exact:true}).click();await expect(guest.locator('.ww-bubble')).toHaveCount(1)
    await host.getByLabel('Estado de publicaciones',{exact:true}).selectOption('hidden');await host.getByRole('button',{name:'Rechazar',exact:true}).click();await host.getByLabel('Estado de publicaciones',{exact:true}).selectOption('rejected');await expect(host.locator('.ww-moderation-card')).toHaveCount(1)
    const independent=await guestContext.newPage();await independent.goto(`/i/${individualToken}`);await expect(independent.getByLabel('¿Quién de esta invitación escribe?',{exact:false})).toHaveCount(0);await expect(independent.locator('.ww-bubble')).toHaveCount(1)
    const moderatorContext=await browser.newContext({viewport:{width,height:1000}});contexts.push(moderatorContext);const mod=await moderatorContext.newPage();await login(mod,users[1].email,password);await mod.goto(`/eventos/${eventId}/buenos-deseos`);await expect(mod.getByRole('heading',{name:'Buenos deseos',exact:true})).toBeVisible();await expect(mod.getByText('Período de participación y límites',{exact:true})).toHaveCount(0)
    const deniedContext=await browser.newContext({viewport:{width,height:1000}});contexts.push(deniedContext);const denied=await deniedContext.newPage();await login(denied,users[2].email,password);await denied.goto(`/eventos/${eventId}/buenos-deseos`);await expect(denied.getByRole('alert')).toContainText('No tenés permiso')
    if(layout.template==='romantic'&&width===1440){
      // Play a full minute while the signed URL refreshes at 45 seconds. A new
      // credential must not interrupt playback, and replay must begin at zero.
      await checked(sdk.rpc('configure_event_wall',{p_event_id:eventId,p_enabled:true,p_opens_at:null,p_closes_at:null,p_audio_max_seconds:60}))
      const post=await beginWall(personalToken,'Un minuto para recordar',{audio_count:1})
      expect(post.ok).toBe(true)
      await checked(client().functions.invoke('wall-media',{body:wallAudioForm(personalToken,post.post_id,encodeWav(new Float32Array(16000*60)))}))
      expect((await wall(personalToken,{action:'submit',post_id:post.post_id})).status).toBe('pending')
      let mediaSignatures=0
      guest.on('response',async response=>{
        if(!response.url().endsWith('/functions/v1/wall-media'))return
        if(!response.ok())return
        try{const request=response.request().postDataJSON();if(request.action==='sign'&&request.post_ids?.includes(post.post_id)){const data=await response.json();if(data.media?.some(media=>media.kind==='audio'))mediaSignatures++}}catch{/* The page may close after this check. */}
      })
      await checked(sdk.rpc('moderate_wall_post',{p_post_id:post.post_id,p_status:'approved'}))
      await guest.getByRole('button',{name:'Actualizar conversación',exact:true}).click()
      const longPlayer=guest.getByLabel('Nota de voz de Familia González',{exact:true});await expect(longPlayer).toBeVisible()
      const original=await longPlayer.evaluate(element=>{element.addEventListener('ended',()=>{element.dataset.completed='yes'},{once:true});return element.getAttribute('src')})
      await longPlayer.evaluate(async element=>{await element.play()})
      await expect.poll(()=>longPlayer.evaluate(element=>element.currentTime),{timeout:55000,intervals:[1000]}).toBeGreaterThan(46)
      expect((await longPlayer.getAttribute('src'))===original).toBe(true);expect(await longPlayer.evaluate(element=>element.paused)).toBe(false)
      await expect.poll(()=>mediaSignatures,{timeout:10000,intervals:[500]}).toBeGreaterThan(1)
      await expect.poll(()=>longPlayer.getAttribute('data-completed'),{timeout:20000,intervals:[1000]}).toBe('yes')
      await expect.poll(async()=>(await longPlayer.getAttribute('src'))!==original).toBe(true)
      await longPlayer.evaluate(async element=>{await element.play()});await expect.poll(()=>longPlayer.evaluate(element=>element.currentTime)).toBeGreaterThan(0);expect(await longPlayer.evaluate(element=>element.currentTime<3)).toBe(true);await longPlayer.evaluate(element=>element.pause())
    }
    expect(exceptions).toEqual([]);expect(consoleLines.some(line=>line.includes(personalToken)||line.includes(individualToken))).toBe(false);expect(personalReferrers).toEqual([])
  }finally{const closing=Promise.allSettled(contexts.map(context=>context.close()));try{if(eventId){await cleanupWall(users[0].sdk,eventId);await cleanupDesign(users[0].sdk,eventId)}removeTestUsers(users.map(user=>user.id))}finally{await closing}}
})
