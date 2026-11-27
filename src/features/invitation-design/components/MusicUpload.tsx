import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { uploadInvitationAudio } from '../api'
import { designError } from '../models'

export function MusicUpload({
  eventId, assetId, hasLegacyMusic, onUploaded, onClear, onBusy,
}: {
  eventId: string
  assetId: string | null
  hasLegacyMusic: boolean
  onUploaded: (id: string) => void
  onClear: () => void
  onBusy: (busy: boolean) => void
}) {
  const [filename, setFilename] = useState('')
  const [localError, setLocalError] = useState('')
  const upload = useMutation({
    mutationFn: (file: File) => uploadInvitationAudio(eventId, file),
    onSuccess: (id, file) => {
      setFilename(file.name)
      onUploaded(id)
    },
    onSettled: () => onBusy(false),
  })
  const choose = (file: File) => {
    setLocalError('')
    if (!/\.(mp3|m4a)$/i.test(file.name) || file.size < 1 || file.size > 8_388_608) {
      setLocalError('Elegí un MP3 o M4A de hasta 8 MB.')
      return
    }
    onBusy(true)
    upload.mutate(file)
  }
  return <div className="mt-5 rounded-xl border border-sand bg-canvas p-4">
    <p className="text-sm font-medium text-forest">Audio de la invitación</p>
    <p className="mt-2 text-xs leading-6 text-muted">Cargá un MP3 o M4A de hasta 8 MB. Los invitados podrán escuchar o pausar la música. Guardá y publicá para actualizar la invitación.</p>
    <label className="relative mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-forest bg-paper px-4 text-sm text-forest has-focus-visible:outline-2">
      {upload.isPending ? 'Cargando audio…' : assetId || hasLegacyMusic ? 'Cambiar audio' : 'Elegir archivo de audio'}
      <input type="file" accept=".mp3,.m4a,audio/mpeg,audio/mp4" disabled={upload.isPending}
        className="absolute inset-0 w-full cursor-pointer opacity-0"
        aria-label="Cargar audio de la invitación"
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) choose(file)
        }} />
    </label>
    {assetId || hasLegacyMusic ? <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-forest">
      <span>{filename || (assetId ? 'Audio cargado' : 'Audio anterior configurado')}</span>
      <button type="button" className="min-h-11 text-clay underline" disabled={upload.isPending} onClick={() => { setFilename(''); onClear() }}>Quitar de la invitación</button>
    </div> : null}
    {localError || upload.isError ? <p role="alert" className="mt-3 text-xs leading-6 text-clay">{localError || designError(upload.error)}</p> : null}
  </div>
}