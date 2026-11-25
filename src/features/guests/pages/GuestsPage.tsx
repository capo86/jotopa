import { useParams } from 'react-router'
import { useEvent } from '../../events'
import { DataState } from '../../../components/ui/DataState'
import { hasPermission } from '../../../lib/permissions'
import { GuestsWorkspace } from '../components/GuestsWorkspace'

export function Component() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  if (!query.data) return <DataState loading={query.isFetching} retry={() => { void query.refetch() }} />
  const { role, event } = query.data
  const fullAccess = hasPermission(role, 'guests.read') && hasPermission(role, 'guests.contact_read')
  if (!fullAccess && !hasPermission(role, 'checkin.write')) return <DataState loading={false} />
  return <GuestsWorkspace key={eventId} eventId={eventId} title={event.title} fullAccess={fullAccess} timezone={event.timezone} />
}
