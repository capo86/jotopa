import { useParams } from 'react-router'
import { useEvent } from '../../events'
import { DataState } from '../../../components/ui/DataState'
import { hasPermission } from '../../../lib/permissions'
import { ImportWorkspace } from '../components/ImportWorkspace'

export function Component() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  if (!query.data) return <DataState loading={query.isFetching} retry={() => { void query.refetch() }} />
  if (!hasPermission(query.data.role, 'guests.write') || !hasPermission(query.data.role, 'guests.contact_read')) return <DataState loading={false} />
  return <ImportWorkspace key={eventId} eventId={eventId} title={query.data.event.title} />
}
