import { useFormContext } from 'react-hook-form'
import type { FieldArrayWithId } from 'react-hook-form'
import type { AssetImages, DesignAsset, InvitationDesign } from '../models'

type GalleryField = FieldArrayWithId<InvitationDesign, 'gallery', 'fieldKey'>

export function GallerySelection({
  photos, assets, images, style, onMove, onRemove, onPreview,
}: {
  photos: GalleryField[]
  assets: DesignAsset[]
  images: AssetImages
  style: InvitationDesign['gallery_style']
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
  onPreview: () => void
}) {
  const { register } = useFormContext<InvitationDesign>()
  const byId = new Map(assets.map(asset => [asset.id, asset]))
  return <section className="mt-5 border-t border-line pt-5" aria-labelledby="gallery-selection-title">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">LO QUE VERÁN LOS INVITADOS</p>
        <h3 id="gallery-selection-title" className="mt-2 font-display text-2xl text-forest">Tu galería, en este orden.</h3>
        <p className="mt-2 text-xs leading-6 text-muted">Estas fotos saldrán al publicar. {style === 'floating' ? 'Aparecerán como un collage en movimiento.' : 'Aparecerán en el collage.'}</p>
      </div>
      <span className="rounded-full border border-forest px-3 py-1 text-xs font-medium text-forest">{photos.length} / 10</span>
    </div>
    {photos.length ? <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo, index) => {
        const image = images[photo.asset_id]
        const label = byId.get(photo.asset_id)?.alt ?? 'Fotografía ' + (index + 1)
        return <li key={photo.fieldKey} className="min-w-0 overflow-hidden rounded-xl border border-line bg-paper">
          <div className="relative">
            {image ? <img src={image.small} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" width={240} height={180} /> :
              <span className="flex aspect-[4/3] items-center justify-center bg-sand px-2 text-center text-xs text-forest">Preparando miniatura</span>}
            <span className="absolute left-2 top-2 rounded-full bg-forest px-2 py-1 text-[.65rem] font-medium text-paper">{index + 1}</span>
          </div>
          <div className="p-3">
            <p className="truncate text-xs text-forest" title={label}>{label}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 text-[.65rem]">
              <button type="button" disabled={index === 0} className="min-h-9 text-forest underline disabled:opacity-40" onClick={() => onMove(index, index - 1)}>Subir</button>
              <button type="button" disabled={index === photos.length - 1} className="min-h-9 text-forest underline disabled:opacity-40" onClick={() => onMove(index, index + 1)}>Bajar</button>
              <button type="button" className="min-h-9 text-clay underline" onClick={() => onRemove(index)}>Quitar</button>
            </div>
            <details className="mt-1 text-xs text-muted">
              <summary className="min-h-9 cursor-pointer py-2">Pie de foto opcional</summary>
              <input {...register(`gallery.${index}.caption`)} maxLength={240} aria-label={'Pie de foto ' + (index + 1)} className="form-input mt-1" />
            </details>
          </div>
        </li>
      })}
    </ul> : <p className="mt-4 rounded-xl border border-dashed border-sand p-5 text-sm text-muted">Todavía no elegiste fotos. Tocá una miniatura en “Fotos cargadas” para agregarla.</p>}
    {photos.length ? <button type="button" className="mt-4 min-h-11 rounded-lg border border-forest px-4 text-sm text-forest" onClick={onPreview}>Ver el efecto en la vista previa</button> : null}
  </section>
}