import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './env'
import { verifySupabaseConnection } from './supabase-connection'
import type { Database } from './database.types'

// No client or requests are created when the public configuration is absent.
export const supabase = supabaseConfig
  ? createClient<Database>(supabaseConfig.url, supabaseConfig.publicKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
  : null

export function checkSupabaseConnection(signal: AbortSignal) {
  return verifySupabaseConnection(supabaseConfig, signal)
}

export function requireSupabase() {
  if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
  return supabase
}


