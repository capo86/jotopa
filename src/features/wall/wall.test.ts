import {test} from 'node:test'
import assert from 'node:assert/strict'
import {encodeWav,inspectWav,AUDIO_SAMPLE_RATE} from './wav.ts'
import {draftSchema,postSchema,wallError} from './models.ts'

test('canonical audio round trip derives duration from actual PCM frames',()=>{
  const bytes=encodeWav(new Float32Array(AUDIO_SAMPLE_RATE*2).fill(.25))
  assert.equal(inspectWav(bytes),2);assert.equal(bytes.length,64044)
  const view=new DataView(bytes.buffer);assert.equal(view.getInt16(44,true),8192)
})
test('audio rejects truncated, disguised, metadata-bearing and inconsistent WAV files',()=>{
  const original=encodeWav(new Float32Array(16000))
  for(const offset of [0,4,8,12,16,20,22,24,28,32,34,36,40]){const bytes=original.slice();bytes[offset]=(bytes[offset]??0)^1;assert.throws(()=>inspectWav(bytes),/invalid_audio/)}
  assert.throws(()=>inspectWav(original.subarray(0,100)),/invalid_audio/)
  assert.throws(()=>inspectWav(new Uint8Array([...original,0,0])),/invalid_audio/)
})
test('audio enforces configured duration and the absolute 120-second limit',()=>{
  const exact=encodeWav(new Float32Array(16000*15));assert.equal(inspectWav(exact,15),15)
  assert.throws(()=>inspectWav(exact,14),/invalid_audio/)
  assert.throws(()=>inspectWav(encodeWav(new Float32Array(16000*120+1))),/invalid_audio/)
  assert.throws(()=>inspectWav(exact,Number.NaN),/invalid_audio/)
})
test('PCM encoding clamps samples without adding source metadata',()=>{
  const bytes=encodeWav(new Float32Array([-2,-1,0,1,2]));const view=new DataView(bytes.buffer)
  assert.deepEqual(Array.from({length:5},(_,index)=>view.getInt16(44+index*2,true)),[-32768,-32768,0,32767,32767]);assert.equal(inspectWav(bytes),5/16000)
})
test('wall drafts permit text, photos, voice and combinations with strict limits',()=>{
  const base={body:'',photo_count:0,audio_count:0,request_id:'10000000-0000-4000-8000-000000000001'}
  assert.equal(draftSchema.safeParse(base).success,false)
  for(const patch of [{body:'Un abrazo'},{photo_count:1},{audio_count:1},{body:'Un recuerdo',photo_count:3,audio_count:1,participant_name:'Ana'}])assert.equal(draftSchema.safeParse({...base,...patch}).success,true)
  for(const patch of [{body:'a'.repeat(2001)},{photo_count:4},{audio_count:2},{participant_name:'a'.repeat(81)},{author_name:'Another recipient'},{event_id:'fake'}])assert.equal(draftSchema.safeParse({...base,body:'Hello',...patch}).success,false)
})
test('public post schema retains separate holder/declared identities and text stays literal',()=>{
  const post=postSchema.parse({id:'10000000-0000-4000-8000-000000000001',author_name:'Familia Pérez',participant_name:'Ana',body:'<script>example</script>',created_at:'2026-11-23T10:00:00Z',media:[]})
  assert.notEqual(post.author_name,post.participant_name);assert.equal(post.body,'<script>example</script>')
  assert.equal(wallError(new Error('unexpected-private-value')).includes('unexpected-private-value'),false)
})
