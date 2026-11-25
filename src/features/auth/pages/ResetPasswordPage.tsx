import { Link } from 'react-router'
import { useAuth } from '../context'
import { AuthPage } from '../components/AuthPage'

export function Component() {
  const { ready, session, recovery, initializationError } = useAuth()
  if (!ready) return <p role="status">Verificando el enlace…</p>
  if (initializationError || !session || !recovery) return (
    <section className="mx-auto max-w-md py-10">
      <h1 className="font-display text-4xl text-forest">Necesitás un enlace válido.</h1>
      <p role="alert" className="mt-5 text-sm leading-7 text-muted">El enlace venció, ya fue utilizado o se abrió en otro navegador. Solicitá uno nuevo y abrilo en el navegador donde lo pediste.</p>
      <Link to="/recuperar-contrasena" className="button-primary mt-6">Solicitar otro enlace</Link>
    </section>
  )
  return <AuthPage mode="reset" />
}
