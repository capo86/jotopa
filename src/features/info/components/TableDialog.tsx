import {useEffect,useRef} from 'react'
import {useForm} from 'react-hook-form'
import {useMutation,useQueryClient} from '@tanstack/react-query'
import {saveTable} from '../api'
import {seatingError,tableInputSchema} from '../models'
import type {EventTable} from '../models'

export function TableDialog({eventId,table,onClose}:{eventId:string;table:EventTable|null;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),cache=useQueryClient()
  const {register,handleSubmit,setError,formState:{errors}}=useForm<{name:string}>({defaultValues:{name:table?.name??''}})
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close()},[])
  const save=useMutation({mutationFn:(name:string)=>saveTable(eventId,name,table?.id),retry:false,onSuccess:async()=>{await Promise.all([cache.invalidateQueries({queryKey:['tables',eventId]}),cache.invalidateQueries({queryKey:['attendance',eventId]}),cache.invalidateQueries({queryKey:['seating',eventId]})]);onClose()}})
  return <dialog ref={dialog} aria-labelledby="table-title" onCancel={event=>{if(save.isPending)event.preventDefault();else onClose()}} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-paper p-6 text-forest shadow-xl backdrop:bg-forest/30"><div className="flex items-start justify-between gap-4"><h2 id="table-title" className="font-display text-3xl">{table?'Editar mesa':'Crear mesa'}</h2><button type="button" className="min-h-11 text-sm underline" disabled={save.isPending} onClick={onClose}>Cerrar</button></div><form noValidate onSubmit={handleSubmit(values=>{const parsed=tableInputSchema.safeParse(values);if(!parsed.success){setError('name',{message:parsed.error.issues[0]?.message??'Revisá el nombre.'});return}save.mutate(parsed.data.name)})}><label className="mt-5 block text-sm">Nombre o número de mesa<input {...register('name')} maxLength={80} className="form-input mt-2" placeholder="Por ejemplo, Mesa 8" /></label>{errors.name?<p role="alert" className="mt-3 text-sm text-clay">{errors.name.message}</p>:null}{save.isError?<p role="alert" className="mt-3 text-sm text-clay">{seatingError(save.error)}</p>:null}<button type="submit" className="button-primary mt-6 w-full" disabled={save.isPending}>{save.isPending?'Guardando…':'Guardar mesa'}</button></form></dialog>
}
