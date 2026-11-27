import {test} from 'node:test'
import assert from 'node:assert/strict'
import {designSchema,emptyDesign,designAssetIds} from './models.ts'
import {normalizeInformationContacts} from './information-models.ts'
import {isAllowedLink,locationLinks} from './links.ts'

test('legacy invitation data upgrades without enabling new sections or losing existing content',()=>{
  const current=emptyDesign('Existing event')
  const {gifts:unusedGifts,lodging:unusedLodging,dress_photo_asset_id:unusedPhoto,music_url:unusedMusic,palette_mix:unusedMix,cover_quote:unusedQuote,cover_quote_title:unusedTitle,cover_quote_signature:unusedSignature,gallery_style:unusedStyle,gallery_ken_burns:unusedKenBurns,...legacyFields}=current
  assert.ok(unusedGifts&&unusedLodging&&unusedPhoto===null&&unusedMusic===''&&unusedMix.reduce((total,part)=>total+part,0)===100&&unusedQuote===''&&unusedTitle===''&&unusedSignature===''&&unusedStyle==='collage'&&unusedKenBurns===false)
  const upgraded=designSchema.parse({...legacyFields,version:1,sections:current.sections.filter(section=>!['gifts','lodging'].includes(section.id))})
  assert.equal(upgraded.version,2);assert.equal(upgraded.names,current.names);assert.equal(upgraded.sections.length,10)
  assert.equal(upgraded.gifts.banking.enabled,false);assert.equal(upgraded.sections.find(section=>section.id==='lodging')?.enabled,false)
})
test('location and external links reject unsafe schemes, credentials, wrong hosts and normalized path escapes',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,test','http://example.com','https://user:pass@example.com','https://example.com:8443','https://example.com/with space','https://example.com/\nsecret'])assert.equal(isAllowedLink(value),false)
  assert.equal(isAllowedLink('https://maps.app.goo.gl/example','maps'),true)
  assert.equal(isAllowedLink('https://www.google.com/maps/dir/?api=1&destination=Asuncion','maps'),true)
  assert.equal(isAllowedLink('https://www.google.com/maps/../not-maps','maps'),false)
  assert.equal(isAllowedLink('https://google.com.evil.test/maps','maps'),false)
  assert.equal(isAllowedLink('https://waze.com/ul?ll=-25.2%2C-57.5&navigate=yes','waze'),true)
  const links=locationLinks({address:'Calle Ñandutí & Jardín',latitude:null,longitude:null,google_maps_url:'',waze_url:''})
  assert.equal(new URL(links.maps).searchParams.get('query'),'Calle Ñandutí & Jardín')
  assert.equal(new URL(links.waze).searchParams.get('q'),'Calle Ñandutí & Jardín')
})
test('banking requires an explicit valid opt-in and new asset references are deduplicated',()=>{
  const design=emptyDesign('Information'),photo='30000000-0000-4000-8000-000000000001'
  assert.equal(designSchema.safeParse({...design,gifts:{...design.gifts,banking:{...design.gifts.banking,enabled:true}}}).success,false)
  const filled={...design,cover_asset_id:photo,dress_photo_asset_id:photo,gifts:{...design.gifts,banking:{...design.gifts.banking,enabled:true,holder:'Host',alias:'event.fixture'}}}
  assert.equal(designSchema.safeParse(filled).success,true);assert.deepEqual(designAssetIds(filled),[photo])
  const withExtra={...filled,gifts:{...filled.gifts,banking_extra:[{...filled.gifts.banking,enabled:true,holder:'Second host',alias:'second.fixture'}]}}
  assert.equal(designSchema.safeParse(withExtra).success,true)
  assert.equal(designSchema.safeParse({...withExtra,gifts:{...withExtra.gifts,banking_extra:[{...withExtra.gifts.banking_extra[0],holder:''}]}}).success,false)
})
test('lodging contacts reuse international normalization without changing the original draft',async()=>{
  const design={...emptyDesign('Information'),lodging:[{id:'30000000-0000-4000-8000-000000000001',name:'Hotel',photo_asset_id:null,address:'',description:'',phone:'0981 123456',whatsapp:'00 595 982 123456',booking_url:'',google_maps_url:'',waze_url:'',latitude:null,longitude:null,enabled:true}]}
  const normalized=await normalizeInformationContacts(design)
  assert.equal(normalized.lodging[0]?.phone,'+595981123456');assert.equal(normalized.lodging[0]?.whatsapp,'+595982123456');assert.equal(design.lodging[0]?.phone,'0981 123456')
  await assert.rejects(()=>normalizeInformationContacts({...design,lodging:[{...design.lodging[0]!,phone:'invalid'}]}),/invalid_lodging_phone/)
})
