import {randomUUID} from 'node:crypto'
import {designFixture} from './design-test-helpers.mjs'

export function informationFixture(cover=null,visible=null,hidden=null){
  const base=designFixture('Information test event')
  return {...base,version:2,cover_asset_id:cover,sections:[...base.sections.slice(0,6),{id:'gifts',enabled:true},{id:'lodging',enabled:true},...base.sections.slice(6)],dress_code:'Dress notes',dress_photo_asset_id:visible,
    schedule:[{id:randomUUID(),kind:'ceremony',enabled:true,label:'Ceremony',venue:'Visible venue',address:'Asuncion, Paraguay',starts_at:new Date(Date.now()+10*86400000).toISOString(),latitude:null,longitude:null,description:'Visible description',photo_asset_id:visible,google_maps_url:'https://maps.app.goo.gl/fixture',waze_url:'https://waze.com/ul?ll=-25.2637%2C-57.5759&navigate=yes'},
      {id:randomUUID(),kind:'reception',enabled:false,label:'HIDDEN MOMENT',venue:'HIDDEN VENUE',address:'Hidden address',starts_at:new Date(Date.now()+10*86400000).toISOString(),latitude:null,longitude:null,description:'HIDDEN DESCRIPTION',photo_asset_id:hidden,google_maps_url:'',waze_url:''}],
    gifts:{message:'A gift message',items:[{id:randomUUID(),name:'Visible gift',description:'A gift description',url:'https://example.com/gift',enabled:true},{id:randomUUID(),name:'HIDDEN GIFT',description:'Hidden description',url:'https://example.com/hidden',enabled:false}],banking:{enabled:false,bank_name:'PRIVATE BANK',holder:'PRIVATE HOLDER',account:'PRIVATE ACCOUNT',alias:'PRIVATE ALIAS',notes:'PRIVATE NOTES'}},
    lodging:[{id:randomUUID(),name:'Visible lodging',photo_asset_id:visible,address:'Asuncion, Paraguay',description:'A lodging description',phone:'+595981123456',whatsapp:'+595981123456',booking_url:'https://example.com/reservation',google_maps_url:'',waze_url:'',latitude:-25.2637,longitude:-57.5759,enabled:true},{id:randomUUID(),name:'HIDDEN LODGING',photo_asset_id:hidden,address:'Hidden address',description:'HIDDEN LODGING DESCRIPTION',phone:'',whatsapp:'',booking_url:'',google_maps_url:'',waze_url:'',latitude:null,longitude:null,enabled:false}]}
}
