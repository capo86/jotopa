import { useEffect, useRef, useState } from 'react'
import type { AssetImages, InvitationDesign } from '../models'
import { AssetPhoto } from './AssetPhoto'

type FloatingPhotoCollageProps = {
  photos: InvitationDesign['gallery']
  images: AssetImages
  kenBurns: boolean
  onImageError?: () => void
}

export function FloatingPhotoCollage({ photos, images, kenBurns, onImageError }: FloatingPhotoCollageProps) {
  const galleryRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const photoIds = photos.map(photo => photo.asset_id).join(':')
  useEffect(() => {
    const items = galleryRef.current?.querySelectorAll<HTMLElement>('.iv-floating-item')
    if (!items?.length) return
    if (!('IntersectionObserver' in window)) {
      items.forEach(item => { item.dataset.visible = 'true' })
      return
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target instanceof HTMLElement) entry.target.dataset.visible = String(entry.isIntersecting)
      }
    }, { rootMargin: '80px 0px' })
    items.forEach(item => observer.observe(item))
    return () => observer.disconnect()
  }, [photoIds])
  const openPhoto = (index: number) => {
    setSelected(index)
    dialogRef.current?.showModal()
  }

  const activePhoto = selected === null ? undefined : photos[selected]
  const activeImage = activePhoto ? images[activePhoto.asset_id] : undefined

  return (
    <div ref={galleryRef} className="iv-floating-gallery" role="region" aria-label="Galería de fotografías" data-ken-burns={kenBurns}>
      <div className="iv-floating-grid">
        {photos.map((photo, index) => {
          const image = images[photo.asset_id]
          return (
            <figure className="iv-floating-item" key={photo.asset_id} style={{ animationDelay: `${(index % 4) * 110}ms` }}>
              <div className="iv-floating-depth">
                <div className="iv-floating-card">
                  <button type="button" className="iv-floating-open" onClick={() => openPhoto(index)} disabled={!image} aria-label={`Ampliar fotografía ${index + 1}${photo.caption ? `: ${photo.caption}` : ''}`}>
                    <span className="iv-floating-frame">
                      <AssetPhoto key={photo.asset_id} image={image} thumbnail eager={index < 4} {...(onImageError ? { onError: onImageError } : {})} />
                    </span>
                  </button>
                  {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
                </div>
              </div>
            </figure>
          )
        })}
      </div>
      <dialog ref={dialogRef} className="iv-floating-lightbox" aria-label="Fotografía ampliada" onClose={() => setSelected(null)} onClick={event => { if (event.target === dialogRef.current) dialogRef.current.close() }}>
        <button type="button" className="iv-floating-close" onClick={() => dialogRef.current?.close()} aria-label="Cerrar fotografía">×</button>
        {activeImage ? <figure><img src={activeImage.large} alt={activeImage.alt} width={activeImage.width} height={activeImage.height} onError={onImageError} />{activePhoto?.caption ? <figcaption>{activePhoto.caption}</figcaption> : null}</figure> : null}
      </dialog>
    </div>
  )
}

