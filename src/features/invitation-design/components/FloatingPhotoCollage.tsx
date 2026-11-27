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
  const [visible, setVisible] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    const element = galleryRef.current
    if (!element) return
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? false)
    }, { rootMargin: '100px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const openPhoto = (index: number) => {
    setSelected(index)
    dialogRef.current?.showModal()
  }

  const activePhoto = selected === null ? undefined : photos[selected]
  const activeImage = activePhoto ? images[activePhoto.asset_id] : undefined

  return (
    <div ref={galleryRef} className="iv-floating-gallery" role="region" aria-label="Galería de fotografías" data-visible={visible} data-ken-burns={kenBurns}>
      <div className="iv-floating-grid">
        {photos.map((photo, index) => {
          const image = images[photo.asset_id]
          return (
            <figure className="iv-floating-item" key={photo.asset_id} style={{ animationDelay: `${Math.min(index, 7) * 110}ms` }}>
              <div className="iv-floating-depth">
                <div className="iv-floating-card">
                  <button type="button" className="iv-floating-open" onClick={() => openPhoto(index)} disabled={!image} aria-label={`Ampliar fotografía ${index + 1}${photo.caption ? `: ${photo.caption}` : ''}`}>
                    <span className="iv-floating-frame">
                      <AssetPhoto key={image?.large ?? photo.asset_id} image={image} {...(onImageError ? { onError: onImageError } : {})} />
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

