import {useParams} from 'react-router'
import {useEvent} from '../../events'
import {hasPermission} from '../../../lib/permissions'
import {DataState} from '../../../components/ui/DataState'
import {TemplatesWorkspace} from '../components/TemplatesWorkspace'
export function Component(){
  const {eventId=''}=useParams(),query=useEvent(eventId)
  if(!query.data)return <DataState loading={query.isFetching} retry={()=>{void query.refetch()}} />
  if(!hasPermission(query.data.role,'invitations.send')||!hasPermission(query.data.role,'guests.contact_read'))return <DataState loading={false} />
  return <TemplatesWorkspace key={eventId} eventId={eventId} title={query.data.event.title} />
}
