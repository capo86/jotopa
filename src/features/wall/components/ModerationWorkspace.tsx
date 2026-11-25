import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Link} from 'react-router'
import {fetchModeration,fetchWallSettings,signModeratorMedia} from '../api'
import {wallError,WALL_STATUS_LABELS} from '../models'
import type {WallStatus} from '../models'
import {WallSettingsForm} from './WallSettingsForm'
import {ModerationCard} from './ModerationCard'
import {ProjectionControls} from './ProjectionControls'
import {useWallRealtime} from '../hooks/useWallRealtime'
import '../wall.css'
import '../projection.css'

export function ModerationWorkspace({eventId,title,timezone,canConfigure}:{eventId:string;title:string;timezone:string;canConfigure:boolean}){
  const [status,setStatus]=useState<WallStatus>('pending'),[page,setPage]=useState(0)
  useWallRealtime(`wall-moderation:${eventId}`,'wall-moderation',eventId)
  const posts=useQuery({queryKey:['wall-moderation',eventId,status,page],queryFn:({signal})=>fetchModeration(eventId,status,page,signal),retry:false})
  const settings=useQuery({queryKey:['wall-settings',eventId],queryFn:({signal})=>fetchWallSettings(eventId,signal),retry:false,enabled:canConfigure})
  const images=useQuery({queryKey:['wall-moderation-media',eventId,...(posts.data?.posts.flatMap(post=>[post.id,post.status])??[])],queryFn:()=>signModeratorMedia(posts.data?.posts??[]),enabled:Boolean(posts.data?.posts.length),retry:false,gcTime:0,refetchInterval:45_000})
  return <section className="ww-admin max-w-6xl"><Link className="text-sm text-forest underline underline-offset-4" to={`/eventos/${eventId}`}>Volver al evento</Link><div className="ww-admin-heading"><div><p className="eyebrow">RECUERDOS PARA {title}</p><h1 className="mt-4 font-display text-4xl tracking-tight text-forest sm:text-5xl">Buenos deseos</h1><p className="mt-4 max-w-xl text-sm leading-7 text-muted">Un espacio para cuidar lo que se comparte. Solo las publicaciones aprobadas aparecen en las invitaciones.</p></div><span aria-hidden="true">♡</span></div>
    {canConfigure?settings.isSuccess?<WallSettingsForm key={eventId} eventId={eventId} timezone={timezone} settings={settings.data} />:settings.isError?<p role="alert" className="mt-5 text-sm text-clay">No pudimos cargar la configuración. <button className="underline" type="button" onClick={()=>{void settings.refetch()}}>Reintentar</button></p>:null:null}
    <ProjectionControls eventId={eventId} timezone={timezone} />
    <div className="my-7 flex flex-wrap items-end justify-between gap-4"><label className="field-label">Estado de publicaciones<select aria-label="Estado de publicaciones" className="form-input" value={status} onChange={event=>{setStatus(event.target.value as WallStatus);setPage(0)}}>{Object.entries(WALL_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="button-secondary" disabled={posts.isFetching} onClick={()=>{void posts.refetch()}}>Actualizar mensajes</button></div>
    {images.isError?<p role="status" className="mb-5 text-sm text-clay">No pudimos cargar algunos archivos. <button className="underline" type="button" onClick={()=>{void images.refetch()}}>Reintentar archivos</button></p>:null}
    {posts.isError?<p role="alert" className="py-10 text-sm text-clay">{wallError(posts.error)}</p>:!posts.data?<p role="status" className="py-10 text-sm text-muted">Cargando buenos deseos…</p>:posts.data.posts.length===0?<div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm leading-7 text-muted">No hay publicaciones en este estado.<br />Los mensajes nuevos llegarán a Pendiente de aprobación.</div>:<div className="grid items-start gap-5 lg:grid-cols-2">{posts.data.posts.map(post=><ModerationCard key={post.id} post={post} images={images.data??{}} timezone={timezone} eventId={eventId} />)}</div>}
    <div className="mt-7 flex items-center justify-between gap-3 text-sm"><button type="button" className="button-secondary" disabled={page===0||posts.isFetching} onClick={()=>setPage(current=>Math.max(0,current-1))}>Anterior</button><p className="text-xs text-muted">Página {page+1} · {posts.data?.count??0} publicaciones</p><button type="button" className="button-secondary" disabled={posts.isFetching||(page+1)*25>=(posts.data?.count??0)} onClick={()=>setPage(current=>current+1)}>Siguiente</button></div>
  </section>
}
