import { useRef, useState } from 'react'
import type { AssetImages, InvitationDesign } from '../models'
import { AssetPhoto } from './AssetPhoto'

export function PhotoCarousel({ photos, images, onImageError }: { photos: InvitationDesign['gallery']; images: AssetImages; onImageError?: () => void }) {
  const [index, setIndex] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  const goTo = (next: number) => {
    const safe = Math.max(0, Math.min(next, photos.length - 1))
    setIndex(safe)
    viewport.current?.children[safe]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }
  return <div className="iv-carousel" aria-label="Galería de fotografías">
    <div className="iv-carousel-track" ref={viewport} tabIndex={0} onScroll={event => {
      const element = event.currentTarget
      if (element.clientWidth) setIndex(Math.max(0, Math.min(photos.length - 1, Math.round(element.scrollLeft / element.clientWidth))))
    }}>{photos.map((photo, photoIndex) => <figure className="iv-carousel-slide" key={photo.asset_id} aria-label={`Fotografía ${photoIndex + 1} de ${photos.length}`}><AssetPhoto key={images[photo.asset_id]?.large ?? photo.asset_id} image={images[photo.asset_id]} {...(onImageError ? { onError: onImageError } : {})} />{photo.caption ? <figcaption>{photo.caption}</figcaption> : null}</figure>)}</div>
    {photos.length > 1 ? <div className="iv-carousel-controls"><button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Fotografía anterior">←</button><span aria-live="polite">{index + 1} / {photos.length}</span><button type="button" onClick={() => goTo(index + 1)} disabled={index === photos.length - 1} aria-label="Fotografía siguiente">→</button></div> : null}
  </div>
}
