import { Icon } from '../components/ui/Icon'
import { SupabaseConnectionStatus } from '../components/ui/SupabaseConnectionStatus'
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '../lib/config'
import { appUrl } from '../lib/env'

export function Component() {
  return (
    <section className="max-w-3xl">
      <p className="eyebrow">UN BUEN PUNTO DE PARTIDA</p>
      <h1 className="mt-4 font-display text-5xl tracking-tight text-forest">Tu espacio, listo para empezar.</h1>
      <p className="mt-4 text-sm leading-7 text-muted">La base de Jotopa está preparada. Estos son los ajustes iniciales de tu espacio.</p>
      <div className="mt-8 rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <div className="flex items-start gap-4"><span className="rounded-xl bg-canvas p-3 text-forest"><Icon name="settings" /></span><div className="min-w-0"><h2 className="font-semibold">Conexión con Supabase</h2><SupabaseConnectionStatus /></div></div>
        <details className="mt-6 border-t border-line pt-5 text-sm">
          <summary className="cursor-pointer font-medium text-forest">Cómo configurar la conexión</summary>
          <ol className="mt-4 list-decimal space-y-3 pl-5 leading-6 text-muted">
            <li>Si todavía no existe <code>.env.local</code>, crealo a partir de <code>.env.example</code> en la carpeta del proyecto.</li>
            <li>Completá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> con la URL y la clave publicable de tu proyecto. El nombre de la variable también admite la clave anon anterior.</li>
            <li>Revisá <code>VITE_APP_URL</code> y reiniciá el servidor de desarrollo.</li>
          </ol>
        </details>
      </div>
      <dl className="mt-6 divide-y divide-line rounded-2xl border border-line bg-paper px-6 sm:px-8">
        <div className="setting-row"><dt>Idioma</dt><dd>Español · Paraguay ({DEFAULT_LOCALE})</dd></div>
        <div className="setting-row"><dt>Zona horaria predeterminada</dt><dd>{DEFAULT_TIMEZONE}</dd></div>
        <div className="setting-row"><dt>Dirección de la aplicación</dt><dd className="break-all">{appUrl}</dd></div>
      </dl>
      <p className="mt-6 text-sm leading-6 text-muted">Las cuentas y los perfiles ya están disponibles. El próximo paso es organizar eventos y definir los permisos del equipo.</p>
    </section>
  )
}

