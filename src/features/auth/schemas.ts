import { z } from 'zod'

export const emailSchema = z.email('Ingresá un correo electrónico válido.').trim().toLowerCase()
export const passwordSchema = z.string()
  .min(10, 'Usá al menos 10 caracteres.')
  .max(72, 'Usá hasta 72 caracteres.')
  .regex(/[a-z]/, 'Incluí una letra minúscula.')
  .regex(/[A-Z]/, 'Incluí una letra mayúscula.')
  .regex(/[0-9]/, 'Incluí un número.')
export const nameSchema = z.string().trim().min(2, 'Ingresá al menos 2 caracteres.').max(120, 'Usá hasta 120 caracteres.')
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Ingresá tu contraseña.') })
export const registerSchema = z.object({ fullName: nameSchema, email: emailSchema, password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Las contraseñas no coinciden.' })
export const recoverySchema = z.object({ email: emailSchema })
export const resetPasswordSchema = z.object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Las contraseñas no coinciden.' })
export const profileSchema = z.object({ fullName: nameSchema })

