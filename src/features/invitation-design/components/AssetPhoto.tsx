import {useEffect,useState} from 'react'
import type {AssetImage} from '../models'

export function AssetPhoto({image,cover=false,thumbnail=false,eager=false,focus='center',className='',onError}:{image:AssetImage|undefined;cover?:boolean;thumbnail?:boolean;eager?:boolean;focus?:string;className?:string;onError?:()=>void}){
  const [pinned,setPinned]=useState(image)
  const [failed,setFailed]=useState(false)
  const shown=pinned?.id===image?.id?pinned:image
  useEffect(()=>{
    if(image&&(!pinned||pinned.id!==image.id||(failed&&pinned.small!==image.small))){
      setPinned(image)
      setFailed(false)
    }
  },[image,pinned,failed])
  if(!shown||failed)return <div className={'iv-photo-placeholder '+className}><span aria-hidden="true">✳</span><p>{cover?'Tu fotografía, el comienzo de esta historia':failed?'La fotografía no está disponible':'Un recuerdo para compartir'}</p></div>
  const smallWidth=Math.round(shown.width*Math.min(1,720/Math.max(shown.width,shown.height)))
  return <img className={'iv-photo '+className} src={shown.small} srcSet={!thumbnail&&shown.width>smallWidth?shown.small+' '+smallWidth+'w, '+shown.large+' '+shown.width+'w':undefined} sizes={thumbnail?undefined:cover?'100vw':'(min-width: 800px) 45vw, 90vw'} width={shown.width} height={shown.height} alt={shown.alt} style={{objectPosition:focus}} loading={cover||eager?'eager':'lazy'} fetchPriority={cover?'high':eager?'low':'auto'} decoding="async" onError={()=>{setFailed(true);onError?.()}} />
}