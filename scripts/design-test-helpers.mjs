import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {sql} from './local-test-helpers.mjs'

export function designFixture(title='A local visual invitation'){
  return {version:1,template:'romantic',palette:'olive',font_pair:'classic',names:title,eyebrow:'An invitation',welcome:'A welcome message',show_guest_name:true,closing:'See you there',dress_code:'',details:'',cover_asset_id:null,cover_focus:'center',gallery:[],schedule:[],sections:['welcome','countdown','schedule','dress','gallery','details','rsvp','closing'].map(id=>({id,enabled:true}))}
}
export async function fixturePhoto(page,name='couple'){
  try{return await readFile(join(tmpdir(),'jotopa-visual-fixtures',`${name}.jpg`))}catch{
    // Offline, deterministic image for upload/security tests. Real review
    // photographs are optional local fixtures, never bundled with the app.
    const base64=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;const context=canvas.getContext('2d');const gradient=context.createLinearGradient(0,0,1600,1200);gradient.addColorStop(0,'#244c40');gradient.addColorStop(1,'#ead6b4');context.fillStyle=gradient;context.fillRect(0,0,1600,1200);context.fillStyle='#f5f2e9';context.beginPath();context.arc(800,600,280,0,Math.PI*2);context.fill();return canvas.toDataURL('image/jpeg',.85).split(',')[1]})
    return Buffer.from(base64,'base64')
  }
}
export async function webpFixtures(page){
  const jpeg=await fixturePhoto(page)
  const encoded=await page.evaluate(async base64=>{const image=new Image();image.src=`data:image/jpeg;base64,${base64}`;await image.decode();const render=side=>{const scale=Math.min(1,side/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.84).split(',')[1]};return {large:render(1920),small:render(720)}},jpeg.toString('base64'))
  return {large:Buffer.from(encoded.large,'base64'),small:Buffer.from(encoded.small,'base64')}
}
export async function uploadFixture(sdk,eventId,images,alt='Local test photograph'){
  const body=new FormData();body.set('event_id',eventId);body.set('alt',alt);body.set('large',new Blob([images.large],{type:'image/webp'}),'large.webp');body.set('small',new Blob([images.small],{type:'image/webp'}),'small.webp')
  return sdk.functions.invoke('invitation-assets',{body})
}
export async function cleanupDesign(sdk,eventId){
  if(!/^[a-f0-9-]{36}$/.test(eventId))throw new Error('Unsafe cleanup identifier')
  const assets=await sdk.from('event_invitation_assets').select('id').eq('event_id',eventId)
  if(assets.error)throw new Error('Could not read local image fixtures for cleanup')
  sql(`delete from public.event_invitation_designs where event_id='${eventId}';`)
  let failed=false
  for(const asset of assets.data??[]){
    let removed=false
    for(let attempt=0;attempt<3;attempt++){
      // The RPC marks the same asset deleted and Storage removal is repeatable.
      // Retry only transport/server failures; never bypass authorization or an
      // in-use image guard, and keep the event if file cleanup cannot finish.
      const result=await sdk.functions.invoke('invitation-assets',{body:{action:'remove',event_id:eventId,asset_id:asset.id}})
      if(!result.error){removed=true;break}
      if(result.error.context instanceof Response&&result.error.context.status<500)break
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)))
    }
    if(!removed)failed=true
  }
  if(failed)throw new Error('Could not clean up local image fixtures')
  sql(`delete from public.events where id='${eventId}';`)
}
