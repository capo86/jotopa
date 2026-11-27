import assert from 'node:assert/strict'
import {test} from 'node:test'
import {templateSchema,invitationOperationError} from './models.ts'
import {renderMessage,whatsappChannel,linkChannel} from './channels.ts'
import type {MessagePayload} from './models.ts'

const payload:MessagePayload={guest_id:'50000000-0000-4000-8000-000000000001',full_name:'Ana & José {link}',party_size:1,phone:'+595981123456',token:'3'.repeat(64),body:'Hola {nombre} 🌿\n{fecha} · {lugar}\n{link}\nHasta {fecha_limite}',location_label:'Jardín & salón',starts_at:'2027-07-01T20:00:00Z',timezone:'America/Asuncion',rsvp_deadline:'2027-06-01T20:00:00Z'}
test('template schema enforces placeholders, size and personal credential exclusion',()=>{
  const valid={name:'Invitación',body:payload.body,location_label:payload.location_label}
  assert.equal(templateSchema.safeParse(valid).success,true)
  for(const body of ['Sin enlace','{link} {unknown}','{link} {','{link} '+payload.token,'x'.repeat(2001)+'{link}'])assert.equal(templateSchema.safeParse({...valid,body}).success,false)
  assert.equal(templateSchema.safeParse({...valid,location_label:'x'.repeat(241)}).success,false)
  assert.equal(templateSchema.safeParse({...valid,location_label:payload.token}).success,false)
  assert.equal(templateSchema.safeParse({...valid,name:payload.token}).success,false)
  assert.equal(invitationOperationError(new Error('private server payload')).includes('private'),false)
})
test('single-pass personalization preserves literal guest text and accurately encodes the WhatsApp URL',()=>{
  const message=renderMessage(payload,'http://localhost:5174')
  assert.ok(message.text.includes('Ana & José {link}'))
  assert.ok(message.text.includes('Jardín & salón'))
  assert.equal(message.text.split(message.link).length-1,1)
  assert.equal(linkChannel.createUrl(message),message.link)
  const url=new URL(whatsappChannel.createUrl(message))
  assert.equal(url.origin,'https://api.whatsapp.com');assert.equal(url.pathname,'/send');assert.equal(url.searchParams.get('phone'),'595981123456');assert.equal(url.searchParams.get('text'),message.text)
  assert.ok(url.search.includes('%0A'));assert.ok(url.search.includes('%26'));assert.ok(url.search.includes('%F0%9F%8C%BF'))
  for(const phone of [null,'123','0981123456','+999123456789','+595981123456?text=attack','++595981123456'])assert.throws(()=>whatsappChannel.createUrl({...message,phone}),/invitation_invalid_phone/)
  const fallback=renderMessage({...payload,location_label:''},'http://localhost:5174');assert.ok(fallback.text.includes('Lugar a confirmar'))
})

test('group invitations use ustedes without rewriting personalized guest names',()=>{
  const body='Hola {nombre}. Queremos compartir un momento especial con vos. {link}'
  const single=renderMessage({...payload,full_name:'Ana con vos',body,party_size:1},'http://localhost:5174')
  const group=renderMessage({...payload,full_name:'Ana con vos',body,party_size:3},'http://localhost:5174')
  assert.ok(single.text.includes('Ana con vos'))
  assert.ok(single.text.includes('especial con vos.'))
  assert.ok(group.text.includes('Ana con vos'))
  assert.ok(group.text.includes('especial con ustedes.'))
  assert.equal(group.text.includes('especial con vos.'),false)
  assert.ok(renderMessage({...payload,body:'Con vos celebramos. {link}',party_size:2},'http://localhost:5174').text.includes('Con ustedes celebramos.'))
})