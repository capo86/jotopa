import { useMutation, useQueryClient } from '@tanstack/react-query'
import { removeAsset } from '../api'
import { designError, designAssetIds } from '../models'
import type { AssetImages, DesignAsset, InvitationDesign } from '../models'

export function PhotoLibrary({
  eventId, assets, images, design, selectedIds, coverId, onCover, onGalleryToggle,
}: {
  eventId: string
  assets: DesignAsset[]
  images: AssetImages
  design: InvitationDesign
  selectedIds: string[]
  coverId: string | null
  onCover: (id: string | null) => void
  onGalleryToggle: (id: string) => void
}) {
  const cache = useQueryClient()
  const remove = useMutation({
    mutationFn: (id: string) => removeAsset(eventId, id),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['design-assets', eventId] }),
  })
  const ready = assets.filter(asset => asset.status === 'ready')
  const pending = assets.filter(asset => asset.status === 'reserved')
  const selectedReadyCount = ready.filter(asset => selectedIds.includes(asset.id)).length
  const used = new Set([...designAssetIds(design), ...selectedIds, coverId].filter((id): id is string => Boolean(id)))
  return <section className="mt-6" aria-labelledby="photo-library-title">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h3 id="photo-library-title" className="font-display text-xl text-forest">Fotos cargadas</h3>
        <p className="mt-1 text-xs leading-6 text-muted">Tocá “Agregar” sobre una foto para mostrarla en la galería. Podés guardar hasta 20 fotos y elegir hasta 20 para la galería.</p></div>
      <span className="rounded-full border border-sand px-3 py-1 text-xs text-forest">{ready.length} fotos guardadas</span>
    </div>
    {ready.length ? <p className="mt-3 text-xs font-medium text-forest">{selectedReadyCount} en la galería · {ready.length - selectedReadyCount} sin elegir</p> : null}
    {remove.isError ? <p role="alert" className="mt-3 text-sm text-clay">{designError(remove.error)}</p> : null}
    {ready.length ? <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {ready.map(asset => {
        const order = selectedIds.indexOf(asset.id)
        const selected = order >= 0
        const image = images[asset.id]
        return <li key={asset.id} className={'min-w-0 overflow-hidden rounded-xl border bg-paper ' + (selected ? 'border-forest shadow-sm' : 'border-line')}>
          <button type="button" onClick={() => onGalleryToggle(asset.id)} disabled={!selected && selectedIds.length >= 20}
            aria-pressed={selected} aria-label={(selected ? 'Quitar de la galería: ' : 'Agregar a la galería: ') + asset.alt}
            className="relative block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-forest disabled:opacity-50">
            {image ? <img src={image.small} alt="" className="aspect-square w-full object-cover" loading="lazy" width={160} height={160} /> :
              <span className="flex aspect-square items-center justify-center bg-sand px-2 text-center text-[.65rem] text-forest">Preparando miniatura</span>}
            <span className={'absolute left-1 top-1 rounded-full px-2 py-1 text-[.65rem] font-medium ' + (selected ? 'bg-forest text-paper' : 'bg-paper/90 text-forest')}>
              {selected ? 'Galería ' + (order + 1) : '＋ Agregar'}
            </span>
          </button>
          <div className="space-y-1 p-2">
            <p className="truncate text-[.65rem] text-muted" title={asset.alt}>{asset.alt}</p>
            <button type="button" className="min-h-9 text-left text-[.65rem] text-forest underline" onClick={() => onCover(coverId === asset.id ? null : asset.id)}>
              {coverId === asset.id ? '✓ Portada' : 'Usar de portada'}
            </button>
            <button type="button" aria-label={'Eliminar archivo ' + asset.alt} disabled={remove.isPending || used.has(asset.id)}
              className="block min-h-9 text-[.65rem] text-clay underline disabled:opacity-40" onClick={() => remove.mutate(asset.id)}>Eliminar archivo</button>
          </div>
        </li>
      })}
    </ul> : <p className="mt-4 rounded-xl border border-dashed border-sand p-5 text-sm text-muted">Todavía no hay fotografías cargadas.</p>}
    {pending.length ? <ul className="mt-4 space-y-2">{pending.map(asset => <li key={asset.id} className="rounded-lg border border-line p-3 text-xs text-muted">
      Carga incompleta: {asset.alt}. <button type="button" className="min-h-9 text-clay underline" disabled={remove.isPending} onClick={() => remove.mutate(asset.id)}>Liberar espacio</button>
    </li>)}</ul> : null}
  </section>
}