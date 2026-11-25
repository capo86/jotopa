import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { Tables } from '../../../lib/database.types'
import { InputField } from '../../../components/ui/InputField'
import { eventErrorMessage } from '../../../lib/event-errors'
import { saveEvent } from '../api'
import { localDateTime } from '../dates'
import { eventFormSchema, TYPE_LABELS, STATUS_LABELS, EVENT_TYPES, EVENT_STATUSES, type EventFormValues } from '../schemas'
import CalendarDays from 'lucide-react/icons/calendar-days'
import HeartHandshake from 'lucide-react/icons/heart-handshake'
import CircleCheck from 'lucide-react/icons/circle-check'
import Save from 'lucide-react/icons/save'

export function EventForm({ event }: { event?: Tables<'events'> }) {
  const { register, handleSubmit, setError, clearErrors, formState: { errors } } = useForm<EventFormValues>({ defaultValues: {
    title: event?.title ?? '', slug: event?.slug ?? '', type: event?.type ?? 'other', timezone: event?.timezone ?? 'America/Asuncion',
    startsAt: event ? localDateTime(event.starts_at, event.timezone) : '', rsvpDeadline: event?.rsvp_deadline ? localDateTime(event.rsvp_deadline, event.timezone) : '', status: event?.status ?? 'draft',
  } })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mutation = useMutation({ mutationFn: (values: EventFormValues) => saveEvent(values, event?.id), onSuccess: async (id) => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['events'] }), queryClient.invalidateQueries({ queryKey: ['event', id] })])
    navigate(`/eventos/${id}`, { replace: true })
  } })
  return <form noValidate className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_12px_40px_-32px_#244c4066]" onSubmit={handleSubmit(values => {
    clearErrors()
    const result = eventFormSchema.safeParse(values)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (key === 'title' || key === 'slug' || key === 'type' || key === 'startsAt' || key === 'timezone' || key === 'rsvpDeadline' || key === 'status') setError(key, { message: issue.message })
      }
      return
    }
    mutation.mutate(result.data)
  })}>
    <fieldset disabled={mutation.isPending} className="min-w-0 divide-y divide-line disabled:opacity-70">
      <section className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:gap-10" aria-labelledby="event-basics-title">
        <div><span className="inline-flex rounded-xl bg-[#edf1e5] p-3 text-forest"><HeartHandshake size={21} strokeWidth={1.7} aria-hidden="true" /></span><p className="eyebrow mt-4">01 · EL ENCUENTRO</p><h2 id="event-basics-title" className="mt-2 font-display text-2xl text-forest">Lo esencial</h2><p className="mt-2 text-sm leading-6 text-muted">El nombre y la identidad de esta celebración.</p></div>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><InputField label="Nombre del evento" field={register('title')} error={errors.title?.message} /></div><InputField label="Tipo de evento" field={register('type')} error={errors.type?.message}>{EVENT_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</InputField><InputField label="Identificador del evento" field={register('slug')} error={errors.slug?.message} hint="Único para este evento. Usá minúsculas, números y guiones." /></div>
      </section>
      <section className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:gap-10" aria-labelledby="event-dates-title">
        <div><span className="inline-flex rounded-xl bg-[#f7eae2] p-3 text-clay"><CalendarDays size={21} strokeWidth={1.7} aria-hidden="true" /></span><p className="eyebrow mt-4">02 · FECHAS Y HORARIOS</p><h2 id="event-dates-title" className="mt-2 font-display text-2xl text-forest">El gran día</h2><p className="mt-2 text-sm leading-6 text-muted">Definí cuándo sucede y hasta cuándo pueden responder.</p></div>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2"><InputField label="Fecha y hora" type="datetime-local" field={register('startsAt')} error={errors.startsAt?.message} /><InputField label="Zona horaria" field={register('timezone')} error={errors.timezone?.message} hint="Las fechas se interpretan en esta zona."><option value="America/Asuncion">Paraguay · Asunción</option><option value="America/Argentina/Buenos_Aires">Argentina · Buenos Aires</option><option value="America/Sao_Paulo">Brasil · São Paulo</option><option value="UTC">UTC</option>{event && !['America/Asuncion','America/Argentina/Buenos_Aires','America/Sao_Paulo','UTC'].includes(event.timezone) ? <option value={event.timezone}>{event.timezone}</option> : null}</InputField><div className="sm:col-span-2"><InputField label="Fecha límite de confirmación" type="datetime-local" field={register('rsvpDeadline')} error={errors.rsvpDeadline?.message} hint="Después de este plazo, la invitación seguirá visible, pero no se podrá cambiar la respuesta." /></div></div>
      </section>
      <section className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:gap-10" aria-labelledby="event-status-title">
        <div><span className="inline-flex rounded-xl bg-[#f1eee3] p-3 text-forest"><CircleCheck size={21} strokeWidth={1.7} aria-hidden="true" /></span><p className="eyebrow mt-4">03 · DISPONIBILIDAD</p><h2 id="event-status-title" className="mt-2 font-display text-2xl text-forest">Estado del evento</h2><p className="mt-2 text-sm leading-6 text-muted">Elegí cuándo estará disponible para tus invitados.</p></div>
        <div className="min-w-0">{event ? <InputField label="Estado" field={register('status')} error={errors.status?.message} hint="Borrador: preparación · Activo: acceso según el período configurado · Cerrado: acceso deshabilitado.">{EVENT_STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</InputField> : <p className="rounded-xl bg-[#f3f4eb] p-4 text-sm leading-6 text-forest">Tu evento empieza como borrador. Vas a ser su propietario.</p>}</div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#f7f8f1] p-5 sm:px-8 sm:py-6"><p className="max-w-md text-xs leading-6 text-muted">Revisá los datos antes de guardar. Podés volver a editarlos cuando lo necesites.</p><button type="submit" className="button-primary w-full sm:w-auto"><Save size={17} aria-hidden="true" />{mutation.isPending ? 'Guardando…' : event ? 'Guardar evento' : 'Crear evento'}</button></div>
    </fieldset>
    {mutation.isError ? <p role="alert" className="px-5 pb-6 text-sm leading-6 text-clay sm:px-8">{eventErrorMessage(mutation.error)}</p> : null}
  </form>
}
