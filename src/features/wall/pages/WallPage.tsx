import {useParams} from 'react-router'
import {useEvent} from '../../events'
import {hasPermission} from '../../../lib/permissions'
import {DataState} from '../../../components/ui/DataState'
import {ModerationWorkspace} from '../components/ModerationWorkspace'

export function Component(){
  const {eventId=''}=useParams(),query=useEvent(eventId)
  if(!query.data)return <DataState loading={query.isFetching} retry={()=>{void query.refetch()}} />
  const {event,role}=query.data
  if(!hasPermission(role,'wall.moderate'))return <p role="alert" className="py-12 text-sm text-clay">No tenés permiso para moderar los buenos deseos de este evento.</p>
  return <ModerationWorkspace eventId={eventId} title={event.title} timezone={event.timezone} canConfigure={hasPermission(role,'event.update')} />
}
