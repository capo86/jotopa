import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { InputField } from '../../../components/ui/InputField'
import { saveGuest } from '../api'
import { guestError } from '../models'
import type { Guest } from '../models'
import { guestFormSchema } from '../validation'
import type { GuestFormValues } from '../validation'

export function GuestDialog({ eventId, guest, onClose }: { eventId: string; guest: Guest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const cache = useQueryClient()
  const { register, handleSubmit, setError, formState: { errors } } = useForm<GuestFormValues>({ defaultValues: {
    full_name: guest?.full_name ?? '', phone: guest?.phone ?? '', email: guest?.email ?? '', document_id: guest?.document_id ?? '', group_label: guest?.group_label ?? '', party_size: guest?.party_size ?? 1, contact_consent: guest?.contact_consent ?? false,
  } })
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  const save = useMutation({ mutationFn: (values: GuestFormValues) => saveGuest(eventId, values, guest?.id), onSuccess: async () => { await cache.invalidateQueries({ queryKey: ['guests', eventId] }); onClose() } })
  const submit = handleSubmit(values => {
    const parsed = guestFormSchema.safeParse(values)
    if (!parsed.success) { for (const issue of parsed.error.issues) setError(issue.path[0] as keyof GuestFormValues, { message: issue.message }); return }
    if(guest&&parsed.data.party_size<guest.attending_count){setError('party_size',{message:`Ya hay ${guest.attending_count} personas confirmadas. El cupo no puede ser menor.`});return}
    save.mutate(values)
  })
  return <dialog ref={ref} onCancel={event => { if (save.isPending) event.preventDefault(); else onClose() }} aria-labelledby="guest-dialog-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-paper p-5 text-forest shadow-xl backdrop:bg-forest/30 sm:p-8">
    <div className="mb-7 flex items-start justify-between gap-3"><div><p className="eyebrow">LA LISTA EMPIEZA CON UNA PERSONA</p><h2 id="guest-dialog-title" className="mt-2 font-display text-3xl">{guest ? 'Editar invitado' : 'Agregar invitado'}</h2></div><button type="button" className="min-h-11 px-2 text-sm underline" onClick={onClose} disabled={save.isPending}>Cerrar</button></div>
    <form onSubmit={submit} noValidate className="space-y-5">
      <InputField label="Destinatario" field={register('full_name')} error={errors.full_name?.message} />
      <div className="grid gap-5 sm:grid-cols-2"><InputField label="Teléfono" type="tel" field={register('phone')} error={errors.phone?.message} hint="Sin prefijo internacional se usa +595." /><InputField label="Correo electrónico" type="email" field={register('email')} error={errors.email?.message} /></div>
      <div className="grid gap-5 sm:grid-cols-2"><InputField label="Documento (opcional)" field={register('document_id')} error={errors.document_id?.message} /><InputField label="Grupo (opcional)" field={register('group_label')} error={errors.group_label?.message} /></div>
      <InputField label="Cupo total" type="number" field={register('party_size', { valueAsNumber: true })} error={errors.party_size?.message} hint="Entre 1 y 21 personas, incluyendo al destinatario principal. El nombre visible no determina el cupo." />
      <label className="flex items-start gap-3 text-sm leading-6"><input {...register('contact_consent')} type="checkbox" className="mt-1 size-4 shrink-0 accent-forest" />Tengo autorización para usar sus datos de contacto para este evento.</label>
      {save.isError ? <p role="alert" className="text-sm text-clay">{guestError(save.error)}</p> : null}
      <button type="submit" className="button-primary w-full" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar invitado'}</button>
    </form>
  </dialog>
}
