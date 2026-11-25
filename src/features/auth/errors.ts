export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  switch (code) {
    case 'invalid_credentials': return 'El correo o la contraseña no son correctos.'
    case 'email_not_confirmed': return 'Confirmá tu correo antes de iniciar sesión.'
    case 'user_already_exists': case 'email_exists': return 'Ya existe una cuenta con ese correo. Intentá iniciar sesión.'
    case 'weak_password': return 'Usá al menos 10 caracteres, una mayúscula, una minúscula y un número.'
    case 'same_password': return 'Elegí una contraseña diferente de la anterior.'
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Hubo demasiados intentos. Esperá unos minutos e intentá de nuevo.'
    case 'otp_expired': case 'flow_state_expired': case 'flow_state_not_found': case 'bad_code_verifier': return 'El enlace venció o no corresponde a este navegador. Solicitá uno nuevo.'
    default: return 'No pudimos completar la operación. Revisá tu conexión e intentá de nuevo.'
  }
}
