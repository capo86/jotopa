import {useState} from 'react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {InvitationContent} from './InvitationContent'

export function InvitationSession({token}:{token:string}) {
  // No token in cache keys, persistent storage, telemetry or error messages.
  // A new route token remounts this private, non-persisted cache.
  const [cache]=useState(()=>new QueryClient())
  const [visitId]=useState(()=>crypto.randomUUID())
  return <QueryClientProvider client={cache}><InvitationContent token={token} visitId={visitId} /></QueryClientProvider>
}
