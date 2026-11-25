import {useEffect,useRef,useState} from 'react'
import type {RefObject} from 'react'
import {advanceConversation} from '../presentation-models'
import type {ScrollPlayback,ScrollPhase} from '../presentation-models'

export function useConversationScroll(viewport:RefObject<HTMLDivElement|null>,enabled:boolean,speed:number){
  const playback=useRef<ScrollPlayback>({position:0,phase:'forward',remaining:0}),written=useRef(0),reported=useRef<ScrollPhase>('forward')
  const [phase,setPhase]=useState<ScrollPhase>('forward')
  useEffect(()=>{
    if(!enabled)return
    const element=viewport.current;if(!element)return
    if(Math.abs(element.scrollTop-written.current)>2)playback.current={position:element.scrollTop,phase:'forward',remaining:0}
    let frame=0,last=performance.now()
    const advance=(now:number)=>{
      // Retain fractional pixels to keep slow speeds moving at 60 Hz.
      if(Math.abs(element.scrollTop-written.current)>2)playback.current={...playback.current,position:element.scrollTop}
      const next=advanceConversation(playback.current,element.scrollHeight-element.clientHeight,(now-last)/1000,speed)
      last=now;playback.current=next;element.scrollTop=next.position;written.current=element.scrollTop
      if(reported.current!==next.phase){reported.current=next.phase;setPhase(next.phase)}
      frame=requestAnimationFrame(advance)
    }
    frame=requestAnimationFrame(advance)
    return()=>cancelAnimationFrame(frame)
  },[viewport,enabled,speed])
  return phase
}
