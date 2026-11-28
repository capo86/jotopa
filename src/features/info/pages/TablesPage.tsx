import {useParams} from 'react-router'
import {useEvent} from '../../events'
import {hasPermission} from '../../../lib/permissions'
import {DataState} from '../../../components/ui/DataState'
import {TablesWorkspace} from '../components/TablesWorkspace'

export function Component(){
  const {eventId=''}=useParams(),query=useEvent(eventId)
  if(!query.data)return <DataState loading={query.isFetching} retry={()=>{void query.refetch()}} />
  const {event,role}=query.data
  if(!hasPermission(role,'tables.assign'))return <p role="alert" className="py-12 text-sm text-clay">No tenés permiso para gestionar las mesas de este evento.</p>
  return <TablesWorkspace event={event} canWrite={hasPermission(role,'tables.write')} canPublish={hasPermission(role,'tables.publish')} canExport={hasPermission(role,'guests.read')} />
}
