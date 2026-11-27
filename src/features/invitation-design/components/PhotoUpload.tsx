import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { uploadAsset } from '../api'
import { designError } from '../models'

type PhotoKind = 'library' | 'cover' | 'gallery'
type Batch = { files: File[]; kind: PhotoKind }
type BatchResult = { ids: string[]; failed: number; lastError: unknown }

function photoDescription(file: File) {
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  if (!stem || /^(img|dsc|photo|foto|image)\s*\d+$/i.test(stem) || /[a-f0-9]{64}/i.test(stem))
    return 'Fotografía del evento'
  return 'Fotografía del evento: ' + stem.slice(0, 210)
}

export function PhotoUpload({
  eventId, galleryCount, libraryCount, onUploaded, onBusy,
}: {
  eventId: string
  galleryCount: number
  libraryCount: number
  onUploaded: (id: string, kind: PhotoKind) => void
  onBusy: (busy: boolean) => void
}) {
  const cache = useQueryClient()
  const [progress, setProgress] = useState('')
  const [notice, setNotice] = useState('')
  const upload = useMutation({
    mutationFn: async ({ files }: Batch): Promise<BatchResult> => {
      const ids: string[] = []
      let failed = 0
      let lastError: unknown = null
      for (const [index, file] of files.entries()) {
        setProgress('Cargando ' + (index + 1) + ' de ' + files.length + ' fotografías…')
        try {
          ids.push(await uploadAsset(eventId, photoDescription(file), file))
        } catch (error) {
          failed += 1
          lastError = error
        }
      }
      return { ids, failed, lastError }
    },
    onSuccess: async (result, variables) => {
      for (const id of result.ids) onUploaded(id, variables.kind)
      await cache.invalidateQueries({ queryKey: ['design-assets', eventId] })
      setNotice(result.failed
        ? result.ids.length + ' fotos cargadas; ' + result.failed + ' no se pudieron cargar. ' + designError(result.lastError)
        : result.ids.length + (result.ids.length === 1 ? ' foto cargada.' : ' fotos cargadas.'))
    },
    onSettled: () => { setProgress(''); onBusy(false) },
    retry: false,
  })
  const choose = (files: File[], kind: PhotoKind) => {
    setNotice('')
    if (!files.length) return
    if (files.length > 20 - libraryCount) {
      setNotice('La biblioteca admite hasta 20 fotos. Elegí menos archivos o eliminá fotos que ya no usás.')
      return
    }
    if (kind === 'gallery' && files.length > 10 - galleryCount) {
      setNotice('La galería admite hasta 10 fotos. Elegí menos archivos para esta carga.')
      return
    }
    onBusy(true)
    upload.mutate({ files, kind })
  }
  return <div className="rounded-xl border border-sand bg-canvas p-4">
    <p className="mb-2 text-sm font-medium text-forest">1. Cargá tus fotografías</p>
    <p className="text-xs leading-6 text-muted">Seleccioná varias fotos para la biblioteca o la galería, sin escribir títulos. Para la portada se elige una foto. JPG, PNG o WebP · hasta 10 MB y 24 megapíxeles por archivo.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {(['library', 'cover', 'gallery'] as const).map(kind => {
        const disabled = upload.isPending || libraryCount >= 20 || (kind === 'gallery' && galleryCount >= 10)
        const label = kind === 'library' ? 'Cargar a la biblioteca' : kind === 'cover' ? 'Cargar portada' : 'Agregar a la galería'
        return <label key={kind} className={'relative inline-flex min-h-11 items-center rounded-lg border border-sand bg-paper px-4 text-xs text-forest has-focus-visible:outline-2 ' + (disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
          {label}
          <input type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" multiple={kind !== 'cover'}
            disabled={disabled} className="absolute inset-0 w-full cursor-pointer opacity-0"
            onChange={event => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              choose(files, kind)
            }} />
        </label>
      })}
    </div>
    {progress ? <p role="status" className="mt-4 text-sm text-forest">{progress}</p> : null}
    {notice ? <p role="status" className="mt-4 text-xs leading-6 text-forest">{notice}</p> : null}
  </div>
}