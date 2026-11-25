import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthState = {
  session: Session | null
  ready: boolean
  recovery: boolean
  initializationError: boolean
  finishRecovery: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('El proveedor de sesión no está disponible.')
  return auth
}
