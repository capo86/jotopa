import { useState } from 'react'
import type { AssetImages, InvitationDesign } from '../models'
import { AssetPhoto } from './AssetPhoto'

type PhotoCollageProps = {
  photos: InvitationDesign['gallery']
  images: AssetImages
  onImageError?: () => void
}

export function PhotoCollage({ photos, images, onImageError }: PhotoCollageProps) {
  const [paused, setPaused] = useState(false)
  const moving = photos.length > 1

  return (
    <div className="iv-collage" role="region" aria-label="Galería de fotografías" data-paused={paused}>
      <div className="iv-collage-grid" data-moving={moving}>
        {photos.map((photo,index) => {
          const image = images[photo.asset_id]
          return (
            <figure className="iv-collage-card" key={photo.asset_id}>
              <div className="iv-collage-frame">
                <AssetPhoto key={photo.asset_id} image={image} thumbnail eager={index < 4} {...(onImageError ? { onError: onImageError } : {})} />
              </div>
              {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
            </figure>
          )
        })}
      </div>
      {moving ? (
        <button className="iv-collage-pause" type="button" onClick={() => setPaused(value => !value)}>
          {paused ? 'Reanudar movimiento' : 'Pausar movimiento'}
        </button>
      ) : null}
    </div>
  )
}
