import { useQuery } from '@tanstack/react-query'
import { supabaseConfiguration } from '../../lib/env'
import { checkSupabaseConnection } from '../../lib/supabase'
import { SupabaseConnectionError } from '../../lib/supabase-connection'
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '../../lib/config'

export function SupabaseConnectionStatus() {
  const connection = useQuery({
    queryKey: ['supabase', 'connection'],
    queryFn: ({ signal }) => checkSupabaseConnection(signal),
    enabled: false,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    networkMode: 'always',
  })

  const { status } = supabaseConfiguration
  let message: string
  if (status === 'missing') {
    message = 'Pendiente de configuración. Completá las variables públicas para verificar la conexión.'
  } else if (status === 'invalid') {
    message = 'Configuración inválida. Revisá la URL y usá una clave publicable o una clave anon. No se realizó ninguna solicitud.'
  } else if (connection.isFetching) {
    message = 'Verificando la conexión con Supabase…'
  } else if (connection.isError) {
    message = connection.error instanceof SupabaseConnectionError
      ? connection.error.message
      : 'No pudimos verificar la conexión. Intentá de nuevo.'
  } else if (connection.isSuccess) {
    const time = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      timeStyle: 'medium', timeZone: DEFAULT_TIMEZONE,
    }).format(new Date(connection.data.verifiedAt))
    message = `Conexión verificada. La API de datos responde y el cliente Supabase pudo consultar Storage con la clave pública. Última comprobación: ${time} (Asunción).`
  } else {
    message = 'Configuración pública cargada. Verificá la conexión para comprobar que la API responde.'
  }

  return (
    <div>
      <p role="status" aria-live="polite" className="mt-2 text-sm leading-6 text-muted">{message}</p>
      {status === 'configured' ? (
        <button type="button" className="button-primary mt-4 disabled:cursor-wait disabled:opacity-60" disabled={connection.isFetching} onClick={() => { void connection.refetch() }}>
          {connection.isFetching ? 'Verificando…' : connection.isError ? 'Reintentar conexión' : connection.isSuccess ? 'Verificar de nuevo' : 'Verificar conexión'}
        </button>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-muted">Esta comprobación no inicia sesión ni valida permisos de acceso a datos.</p>
    </div>
  )
}

