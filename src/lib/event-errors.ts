export function eventErrorMessage(error: unknown): string {
  const message = typeof error === 'object' && error && 'message' in error ? error.message : ''
  const code = typeof error === 'object' && error && 'code' in error ? error.code : ''
  if (message === 'last_owner') return 'El evento debe conservar al menos un propietario.'
  if (message === 'invite_unavailable') return 'La invitación venció, fue utilizada o revocada, o pertenece a otra cuenta.'
  if (message === 'already_member') return 'Esa persona ya forma parte del evento.'
  if (message === 'invite_rate_limit') return 'Alcanzaste el límite de 20 invitaciones por hora. Intentá más tarde.'
  if (code === '42501') return 'No tenés permiso para realizar esta acción. Volvé a cargar el evento.'
  if (code === '23505') return 'Ese identificador ya está en uso. Elegí otro.'
  if (code === '23514' || code === '22023') return 'Revisá los datos y las fechas del evento.'
  return 'No pudimos completar la operación. Revisá tu conexión e intentá de nuevo.'
}
