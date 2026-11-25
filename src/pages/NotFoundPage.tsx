import { Link } from 'react-router'

export function Component() {
  return (
    <section className="py-12">
      <p className="eyebrow">PÁGINA NO ENCONTRADA · 404</p>
      <h1 className="mt-5 font-display text-5xl tracking-tight text-forest">Por acá no era.</h1>
      <p className="mt-5 text-muted">El enlace que abriste no corresponde a una página de Jotopa.</p>
      <Link to="/" className="button-primary mt-7">Volver al inicio</Link>
    </section>
  )
}

