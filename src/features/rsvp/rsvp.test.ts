import assert from 'node:assert/strict'
import {test} from 'node:test'
import {PNG} from 'pngjs'
import {BinaryBitmap,HybridBinarizer,RGBLuminanceSource,QRCodeReader} from '@zxing/library'
import {personalInvitationUrl,invitationQr} from '../guests/index.ts'
import {responseSchema,tokenIsValid,InvitationError,invitationErrorMessage,parseInvitation} from './models.ts'

test('personal URL validation, RSVP validation and safe errors never repeat arbitrary server data',()=>{
  const fixture='1'.repeat(64)
  assert.equal(personalInvitationUrl('http://localhost:5174/base',fixture),`http://localhost:5174/i/${fixture}`)
  for(const token of ['bad','1'.repeat(63),'g'.repeat(64),'A'.repeat(64)]) {assert.equal(tokenIsValid(token),false);assert.throws(()=>personalInvitationUrl('http://localhost:5174',token))}
  assert.throws(()=>personalInvitationUrl('javascript:invalid',fixture))
  assert.throws(()=>personalInvitationUrl('https://user:password@example.test',fixture))
  const valid={response:'yes',attending_count:2,expected_version:0}
  assert.equal(responseSchema.safeParse(valid).success,true)
  for(const patch of [{response:'pending'},{attending_count:22},{attending_count:0},{attending_count:1.5},{response:'no'},{response:'maybe'},{expected_version:-1},{guest_id:'other'}]) assert.equal(responseSchema.safeParse({...valid,...patch}).success,false)
  assert.throws(()=>parseInvitation({ok:false,code:'rate_limited',retry_after:42}),error=>error instanceof InvitationError && error.retryAfter===42)
  assert.throws(()=>parseInvitation({ok:false,code:'raw-sensitive-data'}),error=>error instanceof InvitationError && error.code==='connection_error')
  assert.equal(invitationErrorMessage(new Error('raw-sensitive-data')).includes('raw-sensitive-data'),false)
})

test('QR PNG can actually be decoded by an independent reader to the exact personal URL',async()=>{
  const url=personalInvitationUrl('http://localhost:5174','2'.repeat(64))
  const png=PNG.sync.read(Buffer.from((await invitationQr(url)).split(',')[1]!, 'base64'))
  assert.equal(png.width,768);assert.equal(png.height,768)
  const pixels=new Uint8ClampedArray(png.width*png.height)
  for(let index=0;index<pixels.length;index++) pixels[index]=(png.data[index*4]!+2*png.data[index*4+1]!+png.data[index*4+2]!)>>2
  const result=new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,png.width,png.height))))
  assert.equal(result.getText()===url,true)
})
