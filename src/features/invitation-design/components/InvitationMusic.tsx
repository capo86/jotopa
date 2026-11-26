import {useEffect,useRef,useState} from 'react'

export function InvitationMusic({url}:{url:string}){
  const audio=useRef<HTMLAudioElement>(null)
  const [playing,setPlaying]=useState(false),[failed,setFailed]=useState(false)
  useEffect(()=>{
    const music=audio.current
    if(!music)return
    music.volume=0.25
    void music.play().catch(()=>setPlaying(false))
    const pauseForVoice=(event:Event)=>{if(event.target instanceof HTMLMediaElement&&event.target!==music)music.pause()}
    document.addEventListener('play',pauseForVoice,true)
    return()=>{document.removeEventListener('play',pauseForVoice,true);music.pause()}
  },[url])
  const toggle=()=>{
    const music=audio.current
    if(!music)return
    if(!music.paused){music.pause();return}
    for(const other of document.querySelectorAll<HTMLMediaElement>('audio,video'))if(other!==music)other.pause()
    setFailed(false)
    void music.play().catch(()=>setFailed(true))
  }
  return <div className="iv-music"><audio ref={audio} src={url} loop preload="none" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onError={()=>setFailed(true)} /><button type="button" onClick={toggle} aria-pressed={playing} aria-label={playing?'Pausar música de fondo':'Reproducir música de fondo'}><span aria-hidden="true">{playing?'❚❚':'♫'}</span> {playing?'Pausar música':'Escuchar música'}</button>{failed?<p role="status">No pudimos reproducir la música.</p>:null}</div>
}
