import {test,expect} from '@playwright/test'
import {createServer} from 'node:http'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {client,sql,removeTestUsers,apiUrl} from '../../scripts/local-test-helpers.mjs'
import {checked} from '../../scripts/wall-test-helpers.mjs'
import {cleanupDesign,designFixture,uploadFixture,webpFixtures} from '../../scripts/design-test-helpers.mjs'

async function collector(){
  const font=await readFile('public/fonts/manrope-latin.woff2')
  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6vM0AAAAASUVORK5CYII=','base64')
  const evidence={control:false,leaked:false,rootReferrer:false,paths:new Set()}
  let secret=''
  const server=createServer((request,response)=>{
    const address=new URL(request.url,'http://probe.invalid'),referer=request.headers.referer??''
    if(address.searchParams.has('control'))evidence.control||=referer.includes('/control/i/not-a-personal-token')
    else{
      evidence.paths.add(address.pathname)
      evidence.leaked||=Boolean(secret&&(referer.includes(secret)||request.url.includes(secret)))
      if(['/probe.png','/probe.js','/probe.css','/probe-fetch','/navigation'].includes(address.pathname))evidence.rootReferrer||=Boolean(referer)
    }
    response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Cache-Control','no-store')
    if(address.pathname==='/control/i/not-a-personal-token'){
      response.setHeader('Content-Type','text/html');response.setHeader('Referrer-Policy','unsafe-url')
      response.end('<!doctype html><img src="/probe.png?control=1" alt="Control sin credenciales">');return
    }
    if(address.pathname==='/probe.png'){response.setHeader('Content-Type','image/png');response.end(pixel);return}
    if(address.pathname==='/probe-font.woff2'){response.setHeader('Content-Type','font/woff2');response.end(font);return}
    if(address.pathname==='/probe.css'){
      response.setHeader('Content-Type','text/css')
      response.end('@font-face{font-family:PrivacyProbe;src:url("/probe-font.woff2") format("woff2")}#privacy-probe-font{font-family:PrivacyProbe}');return
    }
    if(address.pathname==='/probe.js'){response.setHeader('Content-Type','application/javascript');response.end('document.documentElement.dataset.privacyProbe="loaded"');return}
    response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Comprobación local de privacidad</title>Solicitud recibida')
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  return {evidence,origin:`http://127.0.0.1:${server.address().port}`,setSecret:value=>{secret=value},close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
}

for(const template of ['romantic','festive','minimal'])for(const width of [360,1440])test(`personal invitation privacy: ${template} at ${width}px`,async({browser,baseURL})=>{
  test.setTimeout(90000)
  const sdk=client(),users=[],contexts=[],probe=await collector(),pending=[]
  const audit={requests:0,fonts:0,stylesheets:0,scripts:0,images:0,referrerLeak:false,foreignLeak:false,unexpectedThirdParty:false,inspectionErrors:0,consoleLeak:false}
  let eventId,secret=''
  try{
    // A synthetic, non-credential path proves that the real HTTP collector can
    // observe Referer. No real invitation token is used in this control.
    const controlContext=await browser.newContext();contexts.push(controlContext)
    const control=await controlContext.newPage();await control.goto(`${probe.origin}/control/i/not-a-personal-token`)
    await expect.poll(()=>probe.evidence.control).toBe(true);await controlContext.close()
    const account=await checked(sdk.auth.signUp({email:`jotopa-privacy-${randomUUID()}@example.test`,password:`Privacy42-${randomUUID()}`}));users.push(account.user.id)
    eventId=await checked(sdk.rpc('create_event',{p_title:'Un encuentro para recordar',p_slug:`privacy-${randomUUID()}`,p_type:'wedding',p_starts_at:new Date(Date.now()+864000000).toISOString()}))
    sql(`update public.events set status='active' where id='${eventId}';`)
    const guestId=await checked(sdk.rpc('save_guest',{p_event_id:eventId,p_data:{full_name:'Invitada de privacidad',party_size:2}}))
    secret=await checked(sdk.rpc('get_guest_invitation_token',{p_event_id:eventId,p_guest_id:guestId}));probe.setSecret(secret)
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(context)
    const page=await context.newPage(),images=await webpFixtures(page),asset=await checked(uploadFixture(sdk,eventId,images,'Retrato de privacidad'))
    await checked(sdk.rpc('save_invitation_design',{p_event_id:eventId,p_design:{...designFixture('Un encuentro para recordar'),template,font_pair:template==='festive'?'modern':'classic',eyebrow:'NOS ENCONTRAMOS',welcome:'Gracias por acompañarnos.',closing:'Hasta nuestro encuentro',cover_asset_id:asset.id},p_expected_revision:0}))
    await checked(sdk.rpc('publish_invitation_design',{p_event_id:eventId,p_expected_revision:1}))
    const trusted=new Set([new URL(baseURL).origin,new URL(apiUrl).origin])
    const observe=request=>{pending.push((async()=>{
      const address=new URL(request.url());if(!['http:','https:'].includes(address.protocol))return
      const headers=await request.allHeaders(),referer=headers.referer??''
      audit.requests++;audit.referrerLeak||=referer.includes('/i/')||referer.includes(secret)
      const kind=request.resourceType()
      if(trusted.has(address.origin)){
        if(kind==='font')audit.fonts++;if(kind==='stylesheet')audit.stylesheets++;if(kind==='script')audit.scripts++;if(kind==='image')audit.images++
      }else{
        audit.unexpectedThirdParty||=address.origin!==probe.origin
        audit.foreignLeak||=request.url().includes(secret)||JSON.stringify(headers).includes(secret)||(request.postData()??'').includes(secret)
      }
    })().catch(()=>{audit.inspectionErrors++}))}
    context.on('request',observe)
    page.on('console',message=>{audit.consoleLeak||=message.text().includes(secret)})
    page.on('websocket',socket=>{audit.foreignLeak||=socket.url().includes(secret)})
    const documentResponse=await page.goto(`/i/${secret}`).catch(()=>{throw new Error('Personal invitation navigation failed')})
    expect(await documentResponse.headerValue('referrer-policy')).toBe('no-referrer')
    await expect(page.locator(`.iv-${template}`)).toHaveCount(1)
    await expect(page.getByRole('heading',{name:'Dejá tus buenos deseos.',exact:false})).toBeVisible()
    const photo=page.getByRole('img',{name:'Retrato de privacidad',exact:true});await expect(photo).toBeVisible();await expect.poll(()=>photo.evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true)
    const fonts=await page.evaluate(async()=>{
      await Promise.all([document.fonts.load('400 16px InvitationManrope'),document.fonts.load('400 16px InvitationCormorant')])
      return {manrope:document.fonts.check('400 16px InvitationManrope'),cormorant:document.fonts.check('400 16px InvitationCormorant'),policy:document.querySelector('meta[name="referrer"]')?.content,stylesheet:document.querySelector('link[href="/fonts/invitation-fonts.css"]')?.referrerPolicy}
    })
    expect(fonts).toEqual({manrope:true,cormorant:true,policy:'no-referrer',stylesheet:'no-referrer'})
    const sheet=await context.request.get('/fonts/invitation-fonts.css');expect(sheet.headers()['referrer-policy']).toBe('no-referrer')
    // These are real requests to a second loopback origin, never intercepted
    // responses and never requests to an external commercial service.
    await page.evaluate(async origin=>{
      await Promise.all([
        new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=origin+'/probe.png';document.body.append(image)}),
        new Promise((resolve,reject)=>{const script=document.createElement('script');script.onload=resolve;script.onerror=reject;script.src=origin+'/probe.js';document.head.append(script)}),
        new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.onload=resolve;link.onerror=reject;link.href=origin+'/probe.css';document.head.append(link)}),
        fetch(origin+'/probe-fetch').then(response=>{if(!response.ok)throw new Error('Local privacy probe failed')})
      ])
      const sample=document.createElement('span');sample.id='privacy-probe-font';sample.textContent='Prueba de fuente';sample.style.cssText='position:fixed;left:0;bottom:0;opacity:0;pointer-events:none';sample.setAttribute('aria-hidden','true');document.body.append(sample)
      await document.fonts.load('16px PrivacyProbe')
      const link=document.createElement('a');link.id='privacy-probe-navigation';link.href=origin+'/navigation';link.target='_blank';link.textContent='Comprobación de navegación';document.body.append(link)
    },probe.origin)
    const popupPromise=context.waitForEvent('page');await page.locator('#privacy-probe-navigation').click();const popup=await popupPromise;await popup.waitForLoadState();await popup.close()
    await expect.poll(()=>probe.evidence.paths.has('/probe-font.woff2')).toBe(true)
    context.off('request',observe);await Promise.all(pending)
    expect(audit.fonts).toBeGreaterThanOrEqual(2);expect(audit.stylesheets).toBeGreaterThanOrEqual(1);expect(audit.scripts).toBeGreaterThan(0);expect(audit.images).toBeGreaterThan(0)
    expect({referrer:audit.referrerLeak,thirdParty:audit.foreignLeak,unplanned:audit.unexpectedThirdParty,inspection:audit.inspectionErrors,console:audit.consoleLeak,collector:probe.evidence.leaked,rootReferrer:probe.evidence.rootReferrer}).toEqual({referrer:false,thirdParty:false,unplanned:false,inspection:0,console:false,collector:false,rootReferrer:false})
    await mkdir('artifacts/etapa-c',{recursive:true})
    const environment=new URL(baseURL).port==='5174'?'desarrollo':'compilado'
    await writeFile(`artifacts/etapa-c/privacidad-${environment}-${template}-${width}.json`,JSON.stringify({checked_at:new Date().toISOString(),environment,template,width,document_policy:'no-referrer',local_fonts_loaded:fonts.manrope&&fonts.cormorant,observed:audit,collector_paths:[...probe.evidence.paths].filter(path=>path!=='/control/i/not-a-personal-token'),negative_control_detected:true,personal_token_in_referer:false},null,2))
  }finally{
    await Promise.allSettled(contexts.map(context=>context.close()))
    // Preserve the real cleanup error and keep the owner if its event remains.
    // This fixture only reads the wall; it never creates posts to purge.
    try{if(eventId)await cleanupDesign(sdk,eventId);removeTestUsers(users)}finally{await probe.close()}
  }
})
