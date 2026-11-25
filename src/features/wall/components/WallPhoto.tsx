import {useState} from 'react'

export function WallPhoto({small,large,author,index,onRetry}:{small:string;large:string;author:string;index:number;onRetry?:()=>void}){
  const [decoded,setDecoded]=useState<string|null>(null),[failed,setFailed]=useState<string|null>(null)
  // A renewed signature updates the enlargement link, not an image that is
  // already decoded. This avoids downloading visible photographs every 45s.
  const source=decoded??small
  if(failed===source)return <div className="ww-photo-error" role="status"><p>Esta fotografía no está disponible por el momento.</p>{onRetry?<button type="button" className="ww-text-button" onClick={()=>{setFailed(null);setDecoded(null);onRetry()}}>Volver a cargar fotografía</button>:null}</div>
  return <a href={large} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={'Abrir fotografía '+(index+1)+' de '+author}><img src={source} alt={'Fotografía compartida por '+author} loading="lazy" decoding="async" width="720" height="540" onLoad={()=>setDecoded(source)} onError={()=>{setDecoded(null);setFailed(source)}} /></a>
}
