import {useForm,useWatch} from 'react-hook-form'
import {useMutation,useQueryClient} from '@tanstack/react-query'
import {respondInvitation} from '../api'
import {InvitationError,invitationErrorMessage,responseSchema,RSVP_LABELS} from '../models'
import type {Invitation,ResponseValues} from '../models'

type FormValues={response:ResponseValues['response']|'';attending_count:number}
export function RsvpForm({token,invitation}:{token:string;invitation:Invitation}){
  const {guest}=invitation
  const {register,control,handleSubmit,setError,clearErrors,formState:{errors}}=useForm<FormValues>({defaultValues:{response:guest.rsvp_status==='pending'?'':guest.rsvp_status,attending_count:guest.rsvp_status==='yes'?guest.attending_count:1}})
  const response=useWatch({control,name:'response'}),cache=useQueryClient()
  const save=useMutation({mutationFn:(values:ResponseValues)=>respondInvitation(token,values),retry:false,gcTime:0,onSuccess:data=>cache.setQueryData(['personal-invitation'],data)})
  return <form className="mt-8" noValidate onSubmit={handleSubmit(values=>{
    clearErrors()
    const result=responseSchema.safeParse({...values,attending_count:values.response==='yes'?values.attending_count:0,expected_version:guest.version})
    if(!result.success){setError('root',{message:result.error.issues[0]?.message??'Revisá tu respuesta.'});return}
    if(result.data.attending_count>guest.party_size){setError('root',{message:`Tu invitación es válida para ${guest.party_size} personas en total.`});return}
    save.mutate(result.data)
  })}>
    <fieldset disabled={save.isPending||!invitation.can_respond}><legend className="font-display text-2xl text-forest">¿Nos acompañás?</legend><div className="mt-5 grid grid-cols-2 gap-3">{(['yes','no'] as const).map(choice=><label key={choice} className={`relative flex min-h-16 cursor-pointer items-center justify-center rounded-lg border px-3 text-center text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-clay ${response===choice?'border-forest bg-forest text-paper':'border-sand bg-paper text-forest'}`}><input {...register('response')} type="radio" value={choice} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />{RSVP_LABELS[choice]}</label>)}</div>
    {response==='yes'&&guest.party_size>1?<div className="mt-6"><label htmlFor="rsvp-people" className="block text-sm text-forest">¿Cuántas personas asistirán en total?</label><select id="rsvp-people" {...register('attending_count',{valueAsNumber:true})} aria-describedby="rsvp-people-hint" className="form-input mt-2">{Array.from({length:guest.party_size},(_,index)=>index+1).map(count=><option value={count} key={count}>{count} {count===1?'persona':'personas'}</option>)}</select><p id="rsvp-people-hint" className="mt-2 text-xs leading-5 text-muted">Incluite en la cantidad. Podés confirmar entre 1 y {guest.party_size} personas.</p></div>:null}
    <button type="submit" className="button-primary mt-6 w-full" disabled={save.isPending||!invitation.can_respond}>{save.isPending?'Guardando…':guest.rsvp_status==='pending'?'Guardar mi respuesta':'Actualizar mi respuesta'}</button></fieldset>
    {errors.root?.message?<p role="alert" className="mt-4 text-sm leading-6 text-clay">{errors.root.message}</p>:null}
    {save.isError?<div role="alert" className="mt-4 text-sm leading-6 text-clay"><p>{invitationErrorMessage(save.error)}</p>{save.error instanceof InvitationError&&save.error.code==='response_changed'?<button className="mt-2 min-h-11 underline" type="button" onClick={()=>{void cache.invalidateQueries({queryKey:['personal-invitation']})}}>Actualizar invitación</button>:null}</div>:null}
  </form>
}
