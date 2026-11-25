import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseConfig } from './supabase-config'

const apiDescriptionSchema = z.object({
  swagger: z.literal('2.0'),
  info: z.object({ title: z.string() }),
  paths: z.record(z.string(), z.unknown()),
})

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

// The SDK has no public method for the REST API root. This diagnostic checks
// PostgREST without inventing a table, calling Auth or changing database data.
export async function verifySupabaseConnection(
  config: SupabaseConfig | null,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<{ verifiedAt: string }> {
  if (!config) throw new SupabaseConnectionError('configuration')

  const timeoutSignal = AbortSignal.timeout(8000)
  const requestSignal = AbortSignal.any([signal, timeoutSignal])
  try {
    const response = await request(`${config.url.replace(/\/$/, '')}/rest/v1/`, {
      method: 'GET',
      headers: { apikey: config.publicKey, Accept: 'application/openapi+json' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: requestSignal,
    })
    if (response.status === 401 || response.status === 403) throw new SupabaseConnectionError('credentials')
    if (!response.ok) throw new SupabaseConnectionError('unavailable')

    const body: unknown = await response.json()
    if (!apiDescriptionSchema.safeParse(body).success) throw new SupabaseConnectionError('response')

    // The REST root is public locally, even for an invalid key. Verify the
    // actual SDK separately against Storage, which rejects invalid keys.
    // accessToken disables Auth initialization for this short-lived probe.
    let sdkStatus: number | undefined
    const diagnosticClient = createClient(config.url, config.publicKey, {
      accessToken: async () => null,
      global: {
        fetch: async (input, init) => {
          const sdkResponse = await request(input, {
            ...init, signal: requestSignal, cache: 'no-store', credentials: 'omit', redirect: 'error',
          })
          sdkStatus = sdkResponse.status
          return sdkResponse
        },
      },
    })
    const { data, error } = await diagnosticClient.storage.listBuckets()
    requestSignal.throwIfAborted()
    if (sdkStatus === undefined) throw new SupabaseConnectionError('network')
    if ([400, 401, 403].includes(sdkStatus)) throw new SupabaseConnectionError('credentials')
    if (sdkStatus >= 400) throw new SupabaseConnectionError('unavailable')
    if (error || !Array.isArray(data)) throw new SupabaseConnectionError('response')

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

