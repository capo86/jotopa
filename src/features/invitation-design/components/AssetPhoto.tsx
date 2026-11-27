import {useState} from 'react'
import type {AssetImage} from '../models'

export function AssetPhoto({image,cover=false,thumbnail=false,eager=false,focus='center',className='',onError}:{image:AssetImage|undefined;cover?:boolean;thumbnail?:boolean;eager?:boolean;focus?:string;className?:string;onError?:()=>void}){
  const [failedUrl,setFailedUrl]=useState<string|null>(null)
  const failed=Boolean(image&&failedUrl===image.small)
  if(!image||failed)return <div className={'iv-photo-placeholder '+className}><span aria-hidden="true">✳</span><p>{cover?'Tu fotografía, el comienzo de esta historia':failed?'La fotografía no está disponible':'Un recuerdo para compartir'}</p></div>
  const smallWidth=Math.round(image.width*Math.min(1,720/Math.max(image.width,image.height)))
  return <img className={'iv-photo '+className} src={image.small} srcSet={!thumbnail&&image.width>smallWidth?image.small+' '+smallWidth+'w, '+image.large+' '+image.width+'w':undefined} sizes={thumbnail?undefined:cover?'100vw':'(min-width: 800px) 45vw, 90vw'} width={image.width} height={image.height} alt={image.alt} style={{objectPosition:focus}} loading={cover||eager?'eager':'lazy'} fetchPriority={cover?'high':eager?'low':'auto'} decoding="async" onError={()=>{setFailedUrl(image.small);onError?.()}} />
}