export function RouteErrorPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <p className="eyebrow">ALGO NO SALIÓ COMO ESPERÁBAMOS</p>
      <h1 className="mt-5 font-display text-4xl text-forest">No pudimos abrir esta página.</h1>
      <p className="mt-4 text-muted">Intentá de nuevo. Si el problema continúa, revisá tu conexión.</p>
      <a href="/" className="button-primary mt-7">Volver a cargar Jotopa</a>
    </main>
  )
}

