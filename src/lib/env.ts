import { httpUrl, parseSupabaseConfiguration } from './supabase-config'

export const supabaseConfiguration = parseSupabaseConfiguration(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// Configuration errors must never include environment values in logs or the UI.
export const supabaseConfig = supabaseConfiguration.config

const appUrlResult = httpUrl.safeParse(import.meta.env.VITE_APP_URL)
export const appUrl = appUrlResult.success ? appUrlResult.data : window.location.origin

