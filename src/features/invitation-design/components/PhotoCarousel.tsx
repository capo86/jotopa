import { useEffect, useRef, useState } from 'react'
import type { AssetImages, InvitationDesign } from '../models'
import { AssetPhoto } from './AssetPhoto'

export function PhotoCarousel({ photos, images, onImageError }: { photos: InvitationDesign['gallery']; images: AssetImages; onImageError?: () => void }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [autoPlay, setAutoPlay] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(true)
  const viewport = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const media=window.matchMedia('(prefers-reduced-motion: reduce)')
    const update=()=>setReducedMotion(media.matches)
    update();media.addEventListener('change',update)
    return()=>media.removeEventListener('change',update)
  },[])
  useEffect(() => {
    if(paused||!autoPlay||reducedMotion||photos.length<2)return
    const timer=window.setInterval(()=>{
      const element=viewport.current
      if(!element||document.hidden)return
      const next=(Math.round(element.scrollLeft/element.clientWidth)+1)%photos.length
      element.scrollTo({left:next*element.clientWidth,behavior:'smooth'})
    },5000)
    return()=>window.clearInterval(timer)
  },[paused,autoPlay,reducedMotion,photos.length])
  const goTo = (next: number) => {
    const safe = Math.max(0, Math.min(next, photos.length - 1))
    setIndex(safe)
    const element=viewport.current
    element?.scrollTo({left:safe*element.clientWidth,behavior:reducedMotion?'instant':'smooth'})
  }
  return <div className="iv-carousel" role="region" aria-roledescription="carrusel" aria-label="Galería de fotografías" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setPaused(false)}}>
    <div className="iv-carousel-track" ref={viewport} tabIndex={0} onScroll={event => {
      const element = event.currentTarget
      if (element.clientWidth) setIndex(Math.max(0, Math.min(photos.length - 1, Math.round(element.scrollLeft / element.clientWidth))))
    }}>{photos.map((photo, photoIndex) => <figure className="iv-carousel-slide" key={photo.asset_id} aria-label={`Fotografía ${photoIndex + 1} de ${photos.length}`}><AssetPhoto key={images[photo.asset_id]?.large ?? photo.asset_id} image={images[photo.asset_id]} {...(onImageError ? { onError: onImageError } : {})} />{photo.caption ? <figcaption>{photo.caption}</figcaption> : null}</figure>)}</div>
    {photos.length > 1 ? <><div className="iv-carousel-controls"><button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Fotografía anterior">←</button><span aria-live={autoPlay&&!reducedMotion?'off':'polite'}>{index + 1} / {photos.length}</span><button type="button" onClick={() => goTo(index + 1)} disabled={index === photos.length - 1} aria-label="Fotografía siguiente">→</button></div><div className="iv-carousel-thumbnails" aria-label="Elegir fotografía">{photos.map((photo,i)=><button type="button" key={photo.asset_id} onClick={()=>goTo(i)} aria-label={`Ver fotografía ${i+1}`} aria-current={i===index?'true':undefined}>{images[photo.asset_id]?<img src={images[photo.asset_id]?.small} alt="" loading="lazy" />:<span aria-hidden="true">✳</span>}</button>)}</div><p className="iv-carousel-hint">Deslizá para recorrer nuestra historia</p>{!reducedMotion?<button type="button" className="iv-carousel-pause" onClick={()=>setAutoPlay(value=>!value)}>{autoPlay?'Pausar fotos':'Reanudar fotos'}</button>:null}</> : null}
  </div>
}
