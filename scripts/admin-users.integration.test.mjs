import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {client,sql,removeTestUsers} from './local-test-helpers.mjs'
import {chromium} from '@playwright/test'

test('local administrator creates a member in one event and ordinary users are denied',async()=>{
  const admin=client(),ordinary=client(),created=[],accounts=[];let eventId
  const password='FixturePassword42'
  try{
    for(const sdk of [admin,ordinary]){
      const result=await sdk.auth.signUp({email:`jotopa-admin-fixture-${randomUUID()}@example.test`,password})
      assert.ifError(result.error);accounts.push(result.data.user.id)
    }
    sql(`update public.profiles set platform_role='super_admin' where user_id='${accounts[0]}';`)
    const event=await admin.rpc('create_event',{p_title:'Evento de prueba',p_slug:`admin-fixture-${randomUUID()}`,p_type:'wedding',p_starts_at:new Date(Date.now()+864000000).toISOString()})
    assert.ifError(event.error);eventId=event.data
    const email=`jotopa-created-fixture-${randomUUID()}@example.test`,body={fullName:'Miembro de prueba',email,password,eventId,role:'content'}
    const denied=await ordinary.functions.invoke('create-event-user',{body});assert.equal(denied.error?.context?.status,403)
    const direct=await ordinary.rpc('admin_add_event_member',{p_event_id:eventId,p_user_id:accounts[1],p_role:'owner'});assert.equal(direct.error?.code,'42501')
    const limited=await ordinary.rpc('reserve_admin_user_creation');assert.equal(limited.error?.code,'42501')
    const anonymous=await client().functions.invoke('create-event-user',{body});assert.equal(anonymous.error?.context?.status,401)
    const request=await admin.functions.invoke('create-event-user',{body});assert.ifError(request.error);assert.equal(request.data.ok,true)
    const rows=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',u.id,'role',m.role,'platform',p.platform_role)),'[]') from auth.users u join public.profiles p on p.user_id=u.id join public.event_members m on m.user_id=u.id where u.email='${email}' and m.event_id='${eventId}';`))
    assert.equal(rows.length,1);created.push(rows[0].id);assert.equal(rows[0].role,'content');assert.equal(rows[0].platform,'organizer')
    const login=await client().auth.signInWithPassword({email,password});assert.ifError(login.error)
    const badRole=await admin.functions.invoke('create-event-user',{body:{...body,email:`invalid-${randomUUID()}@example.test`,role:'super_admin'}});assert.equal(badRole.error?.context?.status,400)
    const invalidEvent=await admin.functions.invoke('create-event-user',{body:{...body,email:`invalid-${randomUUID()}@example.test`,eventId:randomUUID()}});assert.equal(invalidEvent.error?.context?.status,404)
    const existing=await admin.functions.invoke('create-event-user',{body});assert.equal(existing.error?.context?.status,400)
    const quota=await Promise.all(Array.from({length:21},()=>admin.rpc('reserve_admin_user_creation')))
    assert.ok(quota.every(result=>!result.error));assert.ok(quota.some(result=>result.data===false))
  }finally{
    if(eventId)sql(`delete from public.events where id='${eventId}';`)
    removeTestUsers([...created,...accounts])
  }
})

for(const width of [360,1440])test(`local browser creates an event member at ${width}px`,async()=>{
  const sdk=client(),password='FixturePassword42',ownerEmail=`jotopa-admin-ui-${randomUUID()}@example.test`,memberEmail=`jotopa-member-ui-${randomUUID()}@example.test`,userIds=[];let eventId,browser
  try{
    const account=await sdk.auth.signUp({email:ownerEmail,password});assert.ifError(account.error);userIds.push(account.data.user.id)
    sql(`update public.profiles set platform_role='super_admin' where user_id='${account.data.user.id}';`)
    const event=await sdk.rpc('create_event',{p_title:'Encuentro de prueba',p_slug:`admin-ui-${randomUUID()}`,p_type:'wedding',p_starts_at:new Date(Date.now()+864000000).toISOString()});assert.ifError(event.error);eventId=event.data
    browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width,height:900}});const responseStatuses=[];page.on('response',response=>{if(response.url().includes('/functions/v1/create-event-user'))responseStatuses.push(response.status())})
    await page.goto('http://localhost:5176/iniciar-sesion');await page.getByLabel('Correo electrónico',{exact:true}).fill(ownerEmail);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByRole('link',{name:'Administrar usuarios'}).click();await page.getByRole('heading',{name:'Crear miembro',exact:true}).waitFor()
    await page.getByLabel('Nombre completo').fill('Miembro de prueba');await page.getByLabel('Correo electrónico').fill(memberEmail);await page.getByLabel('Contraseña inicial').fill(password);await page.locator('select[name=eventId]').selectOption(eventId);await page.getByLabel('Rol en el evento').selectOption('content');await page.getByRole('button',{name:'Crear miembro'}).click();try{await page.getByText('Usuario creado y vinculado al evento.',{exact:false}).waitFor({timeout:7000})}catch{throw new Error('UI create failed; statuses='+JSON.stringify(responseStatuses)+' invalid='+JSON.stringify(await page.locator('input:invalid,select:invalid').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('name'))))+' alert='+JSON.stringify(await page.locator('[role=alert]').allTextContents()))}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    const linked=JSON.parse(sql(`select coalesce(json_agg(json_build_object('id',u.id,'role',m.role)),'[]') from auth.users u join public.event_members m on m.user_id=u.id where u.email='${memberEmail}' and m.event_id='${eventId}';`));assert.equal(linked.length,1);assert.equal(linked[0].role,'content')
  }finally{
    await browser?.close()
    if(eventId)sql(`delete from public.events where id='${eventId}';`)
    const extra=JSON.parse(sql(`select coalesce(json_agg(id),'[]') from auth.users where email='${memberEmail}';`));removeTestUsers([...extra,...userIds])
  }
})
