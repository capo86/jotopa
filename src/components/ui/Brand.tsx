import { Link } from 'react-router'

export function Brand() {
  return (
    <Link to="/" aria-label="Jotopa, ir al inicio" className="inline-flex items-center gap-2.5 text-[29px] font-semibold tracking-[-1.5px] text-forest">
      <span className="brand-mark" aria-hidden="true"><span /><span /></span>
      jotopa<span className="-ml-2 text-clay">.</span>
    </Link>
  )
}

