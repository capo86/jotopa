import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { Tables } from '../../../lib/database.types'
import { InputField } from '../../../components/ui/InputField'
import { eventErrorMessage } from '../../../lib/event-errors'
import { saveEvent } from '../api'
import { localDateTime } from '../dates'
import { eventFormSchema, TYPE_LABELS, STATUS_LABELS, EVENT_TYPES, EVENT_STATUSES, type EventFormValues } from '../schemas'

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
  return <form noValidate className="rounded-2xl border border-line bg-paper p-5 sm:p-8" onSubmit={handleSubmit(values => {
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
    <fieldset disabled={mutation.isPending} className="grid gap-6 disabled:opacity-70 sm:grid-cols-2">
      <div className="sm:col-span-2"><InputField label="Nombre del evento" field={register('title')} error={errors.title?.message} /></div>
      <InputField label="Tipo de evento" field={register('type')} error={errors.type?.message}>{EVENT_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</InputField>
      <InputField label="Identificador del evento" field={register('slug')} error={errors.slug?.message} hint="Ejemplo: nuestro-gran-encuentro. Debe ser único." />
      <InputField label="Fecha y hora" type="datetime-local" field={register('startsAt')} error={errors.startsAt?.message} />
      <InputField label="Zona horaria" field={register('timezone')} error={errors.timezone?.message} hint="Las horas se interpretan en esta zona."><option value="America/Asuncion">Paraguay · Asunción</option><option value="America/Argentina/Buenos_Aires">Argentina · Buenos Aires</option><option value="America/Sao_Paulo">Brasil · São Paulo</option><option value="UTC">UTC</option>{event && !['America/Asuncion','America/Argentina/Buenos_Aires','America/Sao_Paulo','UTC'].includes(event.timezone) ? <option value={event.timezone}>{event.timezone}</option> : null}</InputField>
      <InputField label="Fecha límite de confirmación" type="datetime-local" field={register('rsvpDeadline')} error={errors.rsvpDeadline?.message} />
      {event ? <InputField label="Estado" field={register('status')} error={errors.status?.message}>{EVENT_STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</InputField> : <p className="self-center text-sm leading-6 text-muted">Tu evento empieza como borrador. Vas a ser su propietario.</p>}
      <button type="submit" className="button-primary justify-self-start sm:col-span-2">{mutation.isPending ? 'Guardando…' : event ? 'Guardar evento' : 'Crear evento'}</button>
    </fieldset>
    {mutation.isError ? <p role="alert" className="mt-5 text-sm leading-6 text-clay">{eventErrorMessage(mutation.error)}</p> : null}
  </form>
}
