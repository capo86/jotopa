import { Link } from 'react-router'
import { EventForm } from '../components/EventForm'

export function Component() {
  return <section className="max-w-3xl"><Link to="/eventos" className="text-sm text-forest underline underline-offset-4">Mis eventos</Link><p className="eyebrow mt-8">DALE UN LUGAR A TU ENCUENTRO</p><h1 className="mt-4 font-display text-5xl tracking-tight text-forest">Crear evento</h1><p className="mt-4 mb-8 text-sm leading-7 text-muted">Empezá con lo esencial. Los detalles se pueden editar después.</p><EventForm /></section>
}
