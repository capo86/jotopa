import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {Link} from 'react-router'
import {archiveTemplate,fetchTemplates} from '../api'
import {invitationOperationError} from '../models'
import type {Template} from '../models'
import {TemplateForm} from './TemplateForm'

export function TemplatesWorkspace({eventId,title}:{eventId:string;title:string}){
  const [editor,setEditor]=useState<{template:Template|null}|null>(null)
  const cache=useQueryClient()
  const query=useQuery({queryKey:['message-templates',eventId],queryFn:({signal})=>fetchTemplates(eventId,signal),retry:false})
  const archive=useMutation({mutationFn:(id:string)=>archiveTemplate(eventId,id),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['message-templates',eventId]})}})
  return <section className="max-w-4xl"><Link to={`/eventos/${eventId}`} className="text-sm text-forest underline underline-offset-4">Volver al evento</Link><p className="eyebrow mt-8 break-words">{title} · CADA PERSONA, UNA INVITACIÓN</p><h1 className="mt-3 font-display text-4xl text-forest sm:text-5xl">Tus palabras, su invitación.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-muted">Prepará un mensaje cercano y completamos los datos de cada persona. Podés editar el texto y los emojis en Plantillas; el enlace personal abre la invitación visual.</p><nav aria-label="Invitaciones" className="my-7 flex gap-6 border-b border-line text-sm"><Link to={`/eventos/${eventId}/invitaciones`} className="min-h-11 py-3 text-muted underline-offset-4 hover:underline">Cola de envío</Link><span aria-current="page" className="border-b-2 border-forest py-3 font-medium text-forest">Plantillas</span></nav>
    {editor?<TemplateForm key={editor.template?.id ?? 'new'} eventId={eventId} template={editor.template} onClose={()=>setEditor(null)} />:<button type="button" className="button-primary" onClick={()=>setEditor({template:null})}>Crear plantilla</button>}
    {query.isFetching?<p role="status" className="my-6 text-sm text-muted">Cargando plantillas…</p>:null}
    {query.isError||archive.isError?<p role="alert" className="my-5 text-sm text-clay">{invitationOperationError(query.error ?? archive.error)}</p>:null}
    {query.data?<ul className="mt-7 grid gap-5 sm:grid-cols-2">{query.data.map(template=><li key={template.id} className="min-w-0 rounded-xl border border-line bg-paper p-5 sm:p-6"><p className="eyebrow">MENSAJE PERSONALIZADO</p><h2 className="mt-3 break-words font-display text-2xl text-forest">{template.name}</h2><p className="my-5 max-h-48 overflow-auto whitespace-pre-wrap break-words border-l-2 border-sand pl-4 text-sm leading-7 text-muted">{template.body}</p><div className="flex flex-wrap gap-5 text-sm"><button type="button" className="min-h-11 underline underline-offset-4" onClick={()=>setEditor({template})} aria-label={`Editar plantilla ${template.name}`}>Editar</button><details><summary className="flex min-h-11 cursor-pointer items-center text-clay">Archivar</summary><p className="text-xs leading-5 text-muted">El historial conserva la referencia a esta plantilla.</p><button type="button" disabled={archive.isPending} className="min-h-11 text-clay underline" onClick={()=>archive.mutate(template.id)}>Confirmar archivo</button></details></div></li>)}</ul>:null}
    {query.data?.length===0?<p className="mt-7 text-sm leading-7 text-muted">Creá una plantilla para preparar la primera invitación.</p>:null}
  </section>
}
