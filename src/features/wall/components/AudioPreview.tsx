import {useEffect,useRef} from 'react'

export function AudioPreview({audio}:{audio:Blob}){
  const player=useRef<HTMLAudioElement>(null)
  useEffect(()=>{const element=player.current,url=URL.createObjectURL(audio);if(element)element.src=url;return()=>{element?.pause();element?.removeAttribute('src');URL.revokeObjectURL(url)}},[audio])
  return <audio ref={player} controls preload="metadata" aria-label="Vista previa de tu nota de voz" className="ww-audio" />
}
