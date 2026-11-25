import { z } from 'zod'
import type { SupabaseConfig } from './supabase-config'

const authSettingsSchema = z.object({ external: z.record(z.string(), z.unknown()) })

type ConnectionErrorCode = 'configuration' | 'credentials' | 'unavailable' | 'response' | 'network' | 'timeout'

const messages: Record<ConnectionErrorCode, string> = {
  configuration: 'Completá la configuración pública y reiniciá Jotopa antes de verificar.',
  credentials: 'Supabase rechazó la clave pública. Revisá la configuración local y reiniciá Jotopa.',
  unavailable: 'La API no está disponible. Revisá que Supabase Local siga iniciado e intentá de nuevo.',
  response: 'La dirección configurada no devolvió la respuesta esperada de la API de Supabase.',
  network: 'No pudimos llegar a Supabase. Revisá la dirección, la conexión y que el servicio local esté iniciado.',
  timeout: 'Supabase tardó demasiado en responder. Intentá de nuevo.',
}

export class SupabaseConnectionError extends Error {
  readonly code: ConnectionErrorCode

  constructor(code: ConnectionErrorCode) {
    super(messages[code])
    this.name = 'SupabaseConnectionError'
    this.code = code
  }
}

// Auth settings is a read-only public endpoint that validates publishable keys
// in both hosted and local Supabase without requiring privileged access.
export async function verifySupabaseConnection(
  config: SupabaseConfig | null,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<{ verifiedAt: string }> {
  if (!config) throw new SupabaseConnectionError('configuration')

  const timeoutSignal = AbortSignal.timeout(8000)
  const requestSignal = AbortSignal.any([signal, timeoutSignal])
  try {
    const response = await request(`${config.url.replace(/\/$/, '')}/auth/v1/settings`, {
      method: 'GET',
      headers: { apikey: config.publicKey, Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: requestSignal,
    })
    if (response.status === 401 || response.status === 403) throw new SupabaseConnectionError('credentials')
    if (!response.ok) throw new SupabaseConnectionError('unavailable')

    const body: unknown = await response.json()
    if (!authSettingsSchema.safeParse(body).success) throw new SupabaseConnectionError('response')

    return { verifiedAt: new Date().toISOString() }
  } catch (error) {
    if (signal.aborted) throw new DOMException('Verificación cancelada.', 'AbortError')
    if (timeoutSignal.aborted) throw new SupabaseConnectionError('timeout')
    if (error instanceof SupabaseConnectionError) throw error
    if (error instanceof SyntaxError) throw new SupabaseConnectionError('response')
    // Never forward raw errors, response bodies, URLs or headers to the UI.
    throw new SupabaseConnectionError('network')
  }
}

