import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {designSchema,emptyDesign,designError} from './models.ts'
import {inspectWebp} from '../../../supabase/functions/invitation-assets/webp.ts'
import {returnPath} from '../auth/return-path.ts'

test('visual design validation bounds content, section order, coordinates and shared credentials',()=>{
  const design=emptyDesign('A real event title')
  assert.equal(designSchema.safeParse(design).success,true)
  assert.equal(designSchema.safeParse({...design,sections:[...design.sections].reverse()}).success,true)
  for(const invalid of [{...design,template:'unknown'},{...design,palette:'#fff'},{...design,names:'x'.repeat(161)},{...design,welcome:'a'.repeat(64)},{...design,sections:design.sections.slice(1)},{...design,gallery:[{asset_id:'invalid',caption:''}]},{...design,schedule:[{id:'3d959172-8cbd-4f97-a087-55cb37a2a152',label:'Arrival',venue:'Place',address:'Asuncion',starts_at:'invalid',latitude:null,longitude:null}]}])assert.equal(designSchema.safeParse(invalid).success,false)
})
test('server WebP inspection accepts actual Canvas output and rejects truncation, metadata and animation',()=>{
  const bytes=Buffer.from(readFileSync(new URL('../../../tests/fixtures/canvas-webp.base64',import.meta.url),'utf8').trim(),'base64')
  assert.deepEqual(inspectWebp(bytes,1920),{width:64,height:48})
  assert.throws(()=>inspectWebp(bytes,32),/invalid_image/)
  assert.throws(()=>inspectWebp(bytes.subarray(0,bytes.length-4),1920),/invalid_image/)
  assert.throws(()=>inspectWebp(new TextEncoder().encode('<svg><script>invalid</script></svg>'),1920),/invalid_image/)
  const animated=Buffer.from(bytes);animated[20]=animated[20]!|2;assert.throws(()=>inspectWebp(animated,1920),/invalid_image/)
  const metadata=Buffer.from(bytes);metadata[20]=metadata[20]!|8;assert.throws(()=>inspectWebp(metadata,1920),/invalid_image/)
})
test('design routes survive login and unknown errors never echo private input',()=>{
  assert.equal(returnPath({from:'/eventos/3d959172-8cbd-4f97-a087-55cb37a2a152/invitacion'}),'/eventos/3d959172-8cbd-4f97-a087-55cb37a2a152/invitacion')
  const secret='sensitive-token-value'
  assert.equal(designError(new Error(secret)).includes(secret),false)
  assert.match(designError(new Error('design_changed')),/versión más reciente/)
})
