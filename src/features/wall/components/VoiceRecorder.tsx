import {useEffect,useRef,useState} from 'react'
import {normalizeAudio} from '../audio'
import {wallError} from '../models'

export function VoiceRecorder({maximum,onAudio,onBusy}:{maximum:number;onAudio:(audio:Blob)=>void;onBusy:(busy:boolean)=>void}){
  const [state,setState]=useState<'idle'|'recording'|'processing'>('idle'),[seconds,setSeconds]=useState(0),[error,setError]=useState('')
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearInterval(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop())}},[])
  function stop(){if(timer.current)clearInterval(timer.current);if(recorder.current?.state==='recording'){setState('processing');recorder.current.stop()}}
  async function start(){
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Este navegador no permite grabar. Podés adjuntar un archivo de audio.');return}
    setError('');onBusy(true);setState('processing')
    try{
      const microphone=await navigator.mediaDevices.getUserMedia({audio:true})
      if(!mounted.current){microphone.getTracks().forEach(track=>track.stop());return}
      stream.current=microphone
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type))
      const instance=new MediaRecorder(microphone,mime?{mimeType:mime}:{})
      recorder.current=instance;const chunks:Blob[]=[]
      instance.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)}
      instance.onstop=()=>{void (async()=>{
        microphone.getTracks().forEach(track=>track.stop());if(timer.current)clearInterval(timer.current)
        if(!mounted.current)return
        setState('processing')
        try{const audio=await normalizeAudio(new Blob(chunks,{type:instance.mimeType}),maximum);if(mounted.current)onAudio(audio)}catch(cause){if(mounted.current)setError(wallError(cause))}
        finally{if(mounted.current){setState('idle');onBusy(false)}}
      })()}
      instance.onerror=()=>{microphone.getTracks().forEach(track=>track.stop());if(timer.current)clearInterval(timer.current);setError('No pudimos grabar el audio. Podés intentarlo de nuevo o adjuntar un archivo.');setState('idle');onBusy(false)}
      instance.start();const started=performance.now();setSeconds(0);setState('recording')
      timer.current=setInterval(()=>{const elapsed=(performance.now()-started)/1000;setSeconds(Math.floor(elapsed));if(elapsed>=maximum-1)stop()},200)
    }catch{stream.current?.getTracks().forEach(track=>track.stop());setState('idle');onBusy(false);setError('No pudimos acceder al micrófono. Revisá el permiso del navegador o adjuntá un archivo de audio.')}
  }
  return <div className="ww-recorder"><button type="button" className={`ww-tool ${state==='recording'?'ww-recording':''}`} disabled={state==='processing'} onClick={()=>{if(state==='recording')stop();else void start()}}><span aria-hidden="true">{state==='recording'?'■':'●'}</span> {state==='recording'?'Detener grabación':state==='processing'?'Preparando audio…':'Grabar nota de voz'}</button><span className="ww-note" role="status">{state==='recording'?`${seconds} s · grabando`:`Hasta ${maximum} segundos`}</span>{error?<p role="alert" className="ww-error">{error}</p>:null}</div>
}
