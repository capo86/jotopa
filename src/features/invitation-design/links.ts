export type LinkKind='external'|'maps'|'waze'

export function isAllowedLink(value:string,kind:LinkKind='external'):boolean {
  if(!value)return true
  if(value.length>1000||/\s/.test(value)||[...value].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127))return false
  try{
    const url=new URL(value)
    if(url.protocol!=='https:'||url.username||url.password||url.port||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname))return false
    if(kind==='maps')return ['maps.app.goo.gl','maps.google.com'].includes(url.hostname)||(['google.com','www.google.com','goo.gl'].includes(url.hostname)&&/^\/maps(?:\/|$)/.test(url.pathname))
    if(kind==='waze')return ['waze.com','www.waze.com'].includes(url.hostname)&&/^\/(ul|live-map)(?:\/|$)/.test(url.pathname)
    return true
  }catch{return false}
}

export function isAllowedAudioLink(value:string):boolean {
  if(!value)return true
  if(!isAllowedLink(value))return false
  try{return /\.(mp3|m4a|aac|ogg|opus|wav|webm)$/i.test(new URL(value).pathname)}catch{return false}
}

export function locationLinks(value:{google_maps_url:string;waze_url:string;address:string;latitude:number|null;longitude:number|null}){
  const coordinates=value.latitude!==null&&value.longitude!==null
  const query=coordinates?`${value.latitude},${value.longitude}`:value.address
  return {
    maps:value.google_maps_url||(query?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`:''),
    waze:value.waze_url||(query?`https://waze.com/ul?${coordinates?'ll':'q'}=${encodeURIComponent(query)}&navigate=yes`:''),
  }
}
