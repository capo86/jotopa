import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthState } from './context'
import { recoveryUser, rememberRecovery } from './recovery-state'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const previousUser = useRef<string | undefined>(undefined)
  const [state, setState] = useState<Omit<AuthState, 'finishRecovery'>>({ session: null, ready: false, recovery: false, initializationError: false })

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    // The callback stays synchronous: awaiting another Auth call here can deadlock.
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return
      const userId = session?.user.id
      if (event === 'PASSWORD_RECOVERY' && userId) rememberRecovery(userId)
      if (!session) rememberRecovery(null)
      if (previousUser.current !== userId) {
        previousUser.current = userId
        queryClient.clear()
      }
      setState((current) => ({
        session, ready: true, initializationError: false,
        recovery: event === 'PASSWORD_RECOVERY' || (Boolean(session) && ((current.session?.user.id === userId && current.recovery) || recoveryUser() === userId)),
      }))
    })
    // initialize is idempotent and reports malformed or expired callback links.
    void client.auth.initialize().then(({ error }) => {
      if (active && error) setState({ session: null, ready: true, recovery: false, initializationError: true })
    }).catch(() => {
      if (active) setState({ session: null, ready: true, recovery: false, initializationError: true })
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [queryClient])

  const value: AuthState = {
    ...state,
    ready: !supabase || state.ready,
    finishRecovery: () => { rememberRecovery(null); setState((current) => ({ ...current, recovery: false })) },
  }
  return <AuthContext value={value}>{children}</AuthContext>
}
