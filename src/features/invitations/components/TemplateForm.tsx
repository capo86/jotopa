import {useForm,useWatch} from 'react-hook-form'
import {useMutation,useQueryClient} from '@tanstack/react-query'
import {InputField} from '../../../components/ui/InputField'
import {saveTemplate} from '../api'
import {invitationOperationError,templateSchema} from '../models'
import type {Template,TemplateValues} from '../models'

export function TemplateForm({eventId,template,onClose}:{eventId:string;template:Template|null;onClose:()=>void}){
  const {register,control,handleSubmit,setError,clearErrors,setValue,formState:{errors}}=useForm<TemplateValues>({defaultValues:{name:template?.name ?? '',body:template?.body ?? 'Hola {nombre} 🌿\n\nTe esperamos el {fecha}, en {lugar}.\nTu invitación personal: {link}\nRespondé antes del {fecha_limite}.\n\n¡Nos encontramos!',location_label:template?.location_label ?? ''}})
  const body=useWatch({control,name:'body'})
  const cache=useQueryClient()
  const save=useMutation({mutationFn:(values:TemplateValues)=>saveTemplate(eventId,values,template?.id),onSuccess:async()=>{await Promise.all([cache.invalidateQueries({queryKey:['message-templates',eventId]}),cache.invalidateQueries({queryKey:['invitation-compose',eventId]})]);onClose()}})
  return <form noValidate className="rounded-xl border border-line bg-paper p-5 sm:p-7" onSubmit={handleSubmit(values=>{
    clearErrors();const parsed=templateSchema.safeParse(values)
    if(!parsed.success){for(const issue of parsed.error.issues){const key=issue.path[0];if(key==='name'||key==='body'||key==='location_label')setError(key,{message:issue.message})}return}
    save.mutate(parsed.data)
  })}><fieldset disabled={save.isPending} className="space-y-5"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl text-forest">{template?'Editar plantilla':'Crear plantilla'}</h2><button type="button" className="min-h-11 text-sm underline" onClick={onClose}>Cancelar</button></div><InputField label="Nombre de la plantilla" field={register('name')} error={errors.name?.message} /><InputField label="Lugar para este mensaje" field={register('location_label')} error={errors.location_label?.message} hint="Si lo dejás vacío, {lugar} mostrará Lugar a confirmar." /><div><label htmlFor="template-body" className="mb-2 block text-sm font-medium text-forest">Mensaje de invitación</label><textarea id="template-body" {...register('body')} rows={9} className="form-input resize-y leading-7" aria-invalid={Boolean(errors.body)} aria-describedby="template-body-hint" /><p id="template-body-hint" className={`mt-2 text-xs leading-6 ${errors.body?'text-clay':'text-muted'}`}>{errors.body?.message ?? `${body.length} / 2.000 caracteres. Texto simple; el enlace personal se completa al preparar cada mensaje.`}</p></div><div className="flex flex-wrap gap-2">{['nombre','link','fecha','lugar','fecha_limite'].map(variable=><button type="button" className="min-h-11 rounded-lg border border-sand px-3 text-xs text-forest" key={variable} onClick={()=>setValue('body',`${body} {${variable}}`,{shouldDirty:true})}>{`{${variable}}`}</button>)}</div><button type="submit" className="button-primary">{save.isPending?'Guardando…':'Guardar plantilla'}</button></fieldset>{save.isError?<p role="alert" className="mt-5 text-sm text-clay">{invitationOperationError(save.error)}</p>:null}</form>
}
