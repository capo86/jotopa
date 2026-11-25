import { Link } from 'react-router'

export function DataState({ loading, retry }: { loading: boolean; retry?: (() => void) | undefined }) {
  if (loading) return <p role="status" className="py-10 text-sm text-muted">Cargando tu espacio…</p>
  return <div className="py-10"><p role="alert" className="text-sm leading-7 text-muted">No encontramos la información o no tenés permiso para verla.</p><div className="mt-5 flex flex-wrap gap-4"><Link to="/eventos" className="button-primary">Volver a mis eventos</Link>{retry ? <button type="button" className="text-sm text-forest underline" onClick={retry}>Reintentar</button> : null}</div></div>
}
