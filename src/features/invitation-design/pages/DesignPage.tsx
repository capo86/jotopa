import {useParams} from 'react-router'
import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useEvent} from '../../events'
import {hasPermission} from '../../../lib/permissions'
import {DataState} from '../../../components/ui/DataState'
import {fetchAssets,fetchDesign,hostAssetImages} from '../api'
import {designError} from '../models'
import {DesignEditor} from '../components/DesignEditor'

export function Component(){
  const [editorVersion,setEditorVersion]=useState(0)
  const {eventId=''}=useParams(),event=useEvent(eventId)
  const allowed=hasPermission(event.data?.role,'content.write')
  const design=useQuery({queryKey:['invitation-design',eventId],queryFn:({signal})=>fetchDesign(eventId,signal),enabled:allowed,retry:false,refetchOnWindowFocus:false})
  const assets=useQuery({queryKey:['design-assets',eventId],queryFn:({signal})=>fetchAssets(eventId,signal),enabled:allowed,retry:false,refetchOnWindowFocus:false})
  const images=useQuery({queryKey:['design-images',eventId,assets.data?.filter(asset=>asset.status==='ready').map(asset=>asset.id).join(':')],queryFn:()=>hostAssetImages(assets.data??[]),enabled:allowed&&Boolean(assets.data),retry:false,gcTime:0,refetchInterval:90_000})
  if(!event.data)return <DataState loading={event.isFetching} retry={()=>{void event.refetch()}} />
  if(!allowed)return <p role="alert" className="p-6 text-sm text-clay">No tenés permiso para editar la invitación de este evento.</p>
  if(design.isError||assets.isError)return <div role="alert" className="p-6"><p className="text-sm text-clay">{designError(design.error??assets.error)}</p><button type="button" className="mt-4 min-h-11 text-sm underline" onClick={()=>{void Promise.all([design.refetch(),assets.refetch()])}}>Volver a intentar</button></div>
  if(design.data===undefined||!assets.data)return <p role="status" className="p-8 text-sm text-muted">Preparando tu estudio de invitación…</p>
  return <DesignEditor key={`${eventId}:${editorVersion}`} event={event.data.event} canPublish={hasPermission(event.data.role,'event.update')} initial={design.data} assets={assets.data} images={images.data??{}} imageError={images.isError} onReload={()=>{void Promise.all([design.refetch(),assets.refetch(),images.refetch()]).then(()=>setEditorVersion(value=>value+1))}} />
}
