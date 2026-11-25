import {useState} from 'react'
import type {AssetImage} from '../models'

export function AssetPhoto({image,cover=false,focus='center',className='',onError}:{image:AssetImage|undefined;cover?:boolean;focus?:string;className?:string;onError?:()=>void}){
  const [failed,setFailed]=useState(false)
  if(!image||failed)return <div className={`iv-photo-placeholder ${className}`}><span aria-hidden="true">✳</span><p>{cover?'Tu fotografía, el comienzo de esta historia':failed?'La fotografía no está disponible':'Un recuerdo para compartir'}</p></div>
  const smallWidth=Math.round(image.width*Math.min(1,720/Math.max(image.width,image.height)))
  return <img className={`iv-photo ${className}`} src={image.small} srcSet={image.width>smallWidth?`${image.small} ${smallWidth}w, ${image.large} ${image.width}w`:undefined} sizes={cover?'100vw':'(min-width: 800px) 45vw, 90vw'} width={image.width} height={image.height} alt={image.alt} style={{objectPosition:focus}} loading={cover?'eager':'lazy'} fetchPriority={cover?'high':'auto'} decoding="async" onError={()=>{setFailed(true);onError?.()}} />
}
