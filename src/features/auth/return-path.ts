export function returnPath(state: unknown): string {
  if (typeof state !== 'object' || !state || !('from' in state)) return '/perfil'
  if (typeof state.from !== 'string') return '/perfil'
  return state.from === '/perfil' || state.from === '/paneladmin/usuarios' || state.from === '/equipo/aceptar' || /^\/eventos(?:\/nuevo|\/[0-9a-f-]{36}(?:\/(?:editar|mesas|buenos-deseos|invitacion|equipo|invitados(?:\/importar)?|invitaciones(?:\/plantillas)?))?)?$/.test(state.from) ? state.from : '/perfil'
}
