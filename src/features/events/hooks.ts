import { useQuery } from '@tanstack/react-query'
import { getEvent, getEventRole } from './api'

export function useEvent(id: string) {
  return useQuery({ queryKey: ['event', id], queryFn: async ({ signal }) => {
    const [event, role] = await Promise.all([getEvent(id, signal), getEventRole(id)])
    return { event, role }
  }, enabled: /^[0-9a-f-]{36}$/.test(id), retry: false })
}
