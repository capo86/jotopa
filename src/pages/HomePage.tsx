import { Link } from 'react-router'
import { Icon } from '../components/ui/Icon'

export function Component() {
  return (
    <>
      <section className="grid items-center gap-8 pb-11 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
        <div className="animate-arrive">
          <p className="eyebrow">BIENVENIDO A TU ESPACIO</p>
          <h1 className="mt-5 max-w-xl font-display text-[clamp(2.65rem,4.4vw,4.5rem)] leading-[1.06] tracking-[-.045em] text-forest">Los buenos encuentros empiezan <em className="font-normal text-clay">acá.</em></h1>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-muted">Una celebración, muchas personas especiales.<br className="hidden sm:block" /> Un solo lugar para empezar a reunirlas.</p>
          <a href="#primeros-pasos" className="button-primary mt-7">Conocer los primeros pasos<Icon name="arrow" className="h-4 w-4" /></a>
        </div>
        <div className="gathering-print animate-arrive" role="img" aria-label="Ilustración de dos formas que se encuentran, con el mensaje: Qué lindo encontrarnos.">
          <span className="print-edition">JOTOPA / EL ARTE DE REUNIR</span>
          <div className="meeting-shapes" aria-hidden="true"><span /><span /><i>✳</i></div>
          <p className="relative font-display text-[2.8rem] leading-[.95] tracking-[-.04em]">Qué lindo<br /><em>encontrarnos.</em></p>
          <span className="print-caption">LOS MOMENTOS SE HACEN JUNTOS.</span>
        </div>
      </section>
      <section aria-labelledby="events-title" className="border-t border-line pt-8">
        <div className="mb-5 flex items-center justify-between gap-4"><h2 id="events-title" className="text-xl font-medium tracking-tight">Tu espacio de encuentros</h2><Link to="/eventos" className="inline-flex items-center gap-2 text-xs font-medium text-forest">Mis eventos<Icon name="arrow" className="h-4 w-4" /></Link></div>
        <div className="rounded-2xl border border-line bg-paper p-7 sm:p-9"><h3 className="font-display text-3xl text-forest">Cada encuentro tiene su equipo.</h3><p className="mt-3 max-w-xl text-sm leading-7 text-muted">Creá un evento, sumá a tus colaboradores y organizá cada celebración desde su propio espacio.</p><Link to="/eventos" className="button-primary mt-5">Abrir mis eventos<Icon name="arrow" className="h-4 w-4" /></Link></div>
      </section>
      <section id="primeros-pasos" aria-labelledby="steps-title" className="scroll-mt-8 pt-11">
        <div className="mb-5 flex items-center gap-3"><Icon name="spark" className="text-clay" /><h2 id="steps-title" className="text-xl font-medium tracking-tight">Todo gran encuentro tiene un comienzo</h2></div>
        <div className="grid gap-6 border-y border-line py-6 sm:grid-cols-3 sm:gap-8">
          <div><span className="step-number">01</span><h3 className="mt-3 text-sm font-semibold">Prepará tu espacio</h3><p className="mt-2 text-sm leading-6 text-muted">Revisá la configuración inicial de Jotopa.</p><Link to="/configuracion" className="mt-3 inline-block text-xs font-semibold text-forest underline underline-offset-4">Ir a configuración</Link></div>
          <div><span className="step-number">02</span><h3 className="mt-3 text-sm font-semibold">Dale forma a tu evento</h3><p className="mt-2 text-sm leading-6 text-muted">El nombre, la fecha y los detalles que lo hacen tuyo.</p><Link to="/eventos/nuevo" className="mt-3 inline-block text-xs font-semibold text-forest underline underline-offset-4">Crear un evento</Link></div>
          <div><span className="step-number">03</span><h3 className="mt-3 text-sm font-semibold">Organizá en equipo</h3><p className="mt-2 text-sm leading-6 text-muted">Abrí tu evento y elegí Equipo y colaboradores para invitar a las personas que te acompañan.</p><Link to="/eventos" className="mt-3 inline-block text-xs font-semibold text-forest underline underline-offset-4">Elegir mi evento</Link></div>
        </div>
      </section>
    </>
  )
}

