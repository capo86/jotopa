import {useEffect,useRef,useState} from 'react'

export function WallAudioPlayer({src,author}:{src:string|undefined;author:string}){
  const player=useRef<HTMLAudioElement>(null),[failed,setFailed]=useState(false)
  useEffect(()=>{const element=player.current;return()=>{element?.pause();element?.removeAttribute('src');element?.load()}},[])
  useEffect(()=>{
    const element=player.current;if(!element||!src)return
    // Signed URLs refresh every 45 seconds. Preserve an ongoing recording's
    // playback instead of resetting its source halfway through a long message.
    const updateSource=(event?:Event)=>{
      if(!element.paused||element.getAttribute('src')===src)return
      const atEnd=element.ended||(Number.isFinite(element.duration)&&element.currentTime>=element.duration-.05)
      // Native pause precedes ended. Changing src in that pause handler would
      // cancel ended and prevent consumers from observing normal completion.
      if(event?.type==='pause'&&atEnd)return
      const position=atEnd?0:element.currentTime
      element.src=src
      if(position>0){const restore=()=>{if(Number.isFinite(element.duration))element.currentTime=Math.min(position,element.duration)};element.addEventListener('loadedmetadata',restore,{once:true})}
    }
    updateSource();element.addEventListener('pause',updateSource);element.addEventListener('ended',updateSource)
    return()=>{element.removeEventListener('pause',updateSource);element.removeEventListener('ended',updateSource)}
  },[src])
  return <div><audio ref={player} controls preload="none" aria-label={`Nota de voz de ${author}`} className="ww-audio" onError={()=>setFailed(true)} onCanPlay={()=>setFailed(false)} />{failed?<p role="status" className="ww-note">No pudimos cargar esta nota de voz. <button type="button" className="ww-text-button" onClick={()=>{if(player.current&&src){player.current.src=src;player.current.load();setFailed(false)}}}>Volver a cargar audio</button></p>:null}</div>
}
