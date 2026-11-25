import { Link, useLocation } from 'react-router'
import { supabase } from '../../../lib/supabase'
import { AuthForm, type AuthMode } from './AuthForm'

const content = {
  login: { title: 'Qué lindo verte de nuevo.', description: 'Entrá a tu espacio y seguí preparando tu próximo encuentro.' },
  register: { title: 'Hacete un lugar.', description: 'Creá tu cuenta para empezar a reunir a las personas que importan.' },
  recover: { title: 'Volvamos a encontrarnos.', description: 'Te enviaremos un enlace para recuperar el acceso a tu cuenta.' },
  reset: { title: 'Un nuevo comienzo.', description: 'Elegí una nueva contraseña para tu cuenta de Jotopa.' },
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const location = useLocation()
  return (
    <section className="mx-auto max-w-md py-3 sm:py-8">
      <p className="eyebrow">TU ESPACIO EN JOTOPA</p>
      <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight text-forest sm:text-5xl">{content[mode].title}</h1>
      <p className="mt-4 mb-7 text-sm leading-7 text-muted">{content[mode].description}</p>
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-8">
        {supabase ? <AuthForm mode={mode} /> : <p role="alert" className="text-sm leading-6 text-clay">La conexión no está configurada. Revisá <Link to="/configuracion" className="underline">la configuración de Jotopa</Link>.</p>}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm text-forest">
        {mode === 'login' ? <Link to="/recuperar-contrasena" className="underline underline-offset-4">Olvidé mi contraseña</Link> : <Link to="/iniciar-sesion" state={location.state} className="underline underline-offset-4">Volver a iniciar sesión</Link>}
      </div>
    </section>
  )
}
