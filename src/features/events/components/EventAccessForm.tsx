import {useForm} from 'react-hook-form'
import {useMutation,useQueryClient} from '@tanstack/react-query'
import {z} from 'zod'
import type {Tables} from '../../../lib/database.types'
import {requireSupabase} from '../../../lib/supabase'
import {eventErrorMessage} from '../../../lib/event-errors'
import {InputField} from '../../../components/ui/InputField'
import {localDateTime,utcDateTime} from '../dates'

const accessSchema=z.object({opensAt:z.string().min(1,'Ingresá una fecha de apertura.'),closesAt:z.string().min(1,'Ingresá una fecha de cierre.')})
type Values=z.infer<typeof accessSchema>
export function EventAccessForm({event}:{event:Tables<'events'>}) {
  const {register,handleSubmit,setError,clearErrors,formState:{errors}}=useForm<Values>({defaultValues:{opensAt:localDateTime(event.session_opens_at,event.timezone),closesAt:localDateTime(event.session_closes_at,event.timezone)}})
  const cache=useQueryClient()
  const mutation=useMutation({mutationFn:async(values:Values)=>{
    const {error}=await requireSupabase().rpc('configure_event_access',{p_event_id:event.id,p_opens_at:utcDateTime(values.opensAt,event.timezone),p_closes_at:utcDateTime(values.closesAt,event.timezone)})
    if(error) throw error
  },onSuccess:async()=>{await cache.invalidateQueries({queryKey:['event',event.id]})}})
  return <details className="mt-8 rounded-xl border border-line bg-paper p-5 sm:p-7"><summary className="cursor-pointer font-medium text-forest">Acceso a las invitaciones personales</summary><p className="mt-4 text-sm leading-7 text-muted">Solo funcionan con el evento Activo y entre estas fechas. El plazo RSVP se configura al editar el evento; después de ese plazo podrán consultar su invitación y pedir la baja de recordatorios mientras el acceso siga abierto.</p><form noValidate className="mt-5" onSubmit={handleSubmit(values=>{
    clearErrors();const parsed=accessSchema.safeParse(values)
    if(!parsed.success){for(const issue of parsed.error.issues) setError(issue.path[0] as keyof Values,{message:issue.message});return}
    try {const opens=utcDateTime(values.opensAt,event.timezone),closes=utcDateTime(values.closesAt,event.timezone);if(closes<=opens){setError('closesAt',{message:'El cierre debe ser posterior a la apertura.'});return}}
    catch {setError('closesAt',{message:'Revisá las fechas y la zona horaria.'});return}
    mutation.mutate(values)
  })}><fieldset disabled={mutation.isPending} className="grid gap-5 sm:grid-cols-2"><InputField label="Apertura del acceso" type="datetime-local" field={register('opensAt')} error={errors.opensAt?.message} /><InputField label="Cierre del acceso" type="datetime-local" field={register('closesAt')} error={errors.closesAt?.message} /><p className="text-xs text-muted sm:col-span-2">Horario de {event.timezone}. El cierre no incluye el instante indicado.</p><button type="submit" className="button-primary justify-self-start sm:col-span-2">{mutation.isPending?'Guardando…':'Guardar período de acceso'}</button></fieldset></form>{mutation.isSuccess?<p role="status" className="mt-4 text-sm text-forest">Período de acceso actualizado.</p>:null}{mutation.isError?<p role="alert" className="mt-4 text-sm text-clay">{eventErrorMessage(mutation.error)}</p>:null}</details>
}
