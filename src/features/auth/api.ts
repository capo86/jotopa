import { requireSupabase } from '../../lib/supabase'
import { appUrl } from '../../lib/env'
import { loginSchema, registerSchema, recoverySchema, resetPasswordSchema, profileSchema } from './schemas'

export async function signIn(values: unknown) {
  const data = loginSchema.parse(values)
  const result = await requireSupabase().auth.signInWithPassword(data)
  if (result.error) throw result.error
  return result.data
}

export async function signUp(values: unknown) {
  const data = registerSchema.parse(values)
  const result = await requireSupabase().auth.signUp({
    email: data.email, password: data.password,
    options: { data: { full_name: data.fullName }, emailRedirectTo: new URL('/perfil', appUrl).href },
  })
  if (result.error) throw result.error
  return { signedIn: Boolean(result.data.session) }
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut({ scope: 'local' })
  if (error) throw error
}

export async function requestPasswordReset(values: unknown) {
  const { email } = recoverySchema.parse(values)
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: new URL('/restablecer-contrasena', appUrl).href,
  })
  if (error) throw error
}

export async function resetPassword(values: unknown) {
  const { password } = resetPasswordSchema.parse(values)
  const { error } = await requireSupabase().auth.updateUser({ password })
  if (error) throw error
}

export async function fetchProfile(userId: string, signal: AbortSignal) {
  const { data, error } = await requireSupabase().from('profiles').select('*').eq('user_id', userId).abortSignal(signal).single()
  if (error) throw error
  return data
}

export async function updateProfile(userId: string, values: unknown) {
  const { fullName } = profileSchema.parse(values)
  const { data, error } = await requireSupabase().from('profiles').update({ full_name: fullName }).eq('user_id', userId).select().single()
  if (error) throw error
  return data
}
