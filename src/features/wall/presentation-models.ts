export const PROJECTION_LOOKS=['olive','rose','night'] as const
export const PROJECTION_FONTS=['classic','modern'] as const
export type ProjectionOptions={look:typeof PROJECTION_LOOKS[number];font:typeof PROJECTION_FONTS[number];size:'comfortable'|'large';presentation:boolean}
export const DEFAULT_PROJECTION_OPTIONS:ProjectionOptions={look:'olive',font:'classic',size:'comfortable',presentation:false}

export function projectionOptionsFromHash(hash:string):ProjectionOptions{
  const values=new URLSearchParams(hash.replace(/^#/,''))
  return {look:PROJECTION_LOOKS.find(value=>value===values.get('look'))??'olive',font:PROJECTION_FONTS.find(value=>value===values.get('font'))??'classic',size:values.get('size')==='large'?'large':'comfortable',presentation:values.get('present')==='1'}
}
export function projectionFragment(access:string,qr:boolean,options:ProjectionOptions):string{
  if(!/^[a-f0-9]{64}$/.test(access))throw new Error('projection_unavailable')
  return new URLSearchParams({access,qr:qr?'1':'0',look:options.look,font:options.font,size:options.size,present:options.presentation?'1':'0'}).toString()
}
export function eventInitials(title:string):string{
  return (title.match(/\p{L}[\p{L}\p{N}]*/gu)??[]).slice(0,2).map(word=>word.slice(0,1)).join('').toLocaleUpperCase('es-PY')||'J'
}
export function audioDuration(seconds:number):string{
  const value=Math.max(0,Math.round(seconds))
  return Math.floor(value/60)+':'+String(value%60).padStart(2,'0')
}
export type ScrollPhase='forward'|'end-pause'|'return'|'start-pause'
export type ScrollPlayback={position:number;phase:ScrollPhase;remaining:number}
export function advanceConversation(state:ScrollPlayback,maximum:number,elapsed:number,speed:number):ScrollPlayback{
  const extent=Math.max(0,maximum),dt=Math.min(.1,Math.max(0,elapsed)),rate=Math.min(70,Math.max(10,speed)),position=Math.min(extent,Math.max(0,state.position))
  if(extent===0)return {position:0,phase:'forward',remaining:0}
  if(state.phase==='end-pause'){
    if(position<extent-1)return {position,phase:'forward',remaining:0}
    return {...state,position,remaining:Math.max(0,state.remaining-dt),phase:state.remaining<=dt?'return':'end-pause'}
  }
  if(state.phase==='start-pause')return {...state,position,remaining:Math.max(0,state.remaining-dt),phase:state.remaining<=dt?'forward':'start-pause'}
  if(state.phase==='return'){
    const next=Math.max(0,position-Math.min(60,Math.max(24,rate*1.5))*dt)
    return {position:next,phase:next===0?'start-pause':'return',remaining:next===0?4:0}
  }
  const next=Math.min(extent,position+rate*dt)
  return {position:next,phase:next===extent?'end-pause':'forward',remaining:next===extent?8:0}
}
