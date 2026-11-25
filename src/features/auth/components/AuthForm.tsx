import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { loginSchema, registerSchema, recoverySchema, resetPasswordSchema } from '../schemas'
import { requestPasswordReset, resetPassword, signIn, signUp } from '../api'
import { authErrorMessage } from '../errors'
import { useAuth } from '../context'
import { returnPath } from '../return-path'
import { FormField } from './FormField'

export type AuthMode = 'login' | 'register' | 'recover' | 'reset'
type Fields = { fullName: string; email: string; password: string; confirmPassword: string }
const schemas = { login: loginSchema, register: registerSchema, recover: recoverySchema, reset: resetPasswordSchema }
const labels = { login: 'Iniciar sesión', register: 'Crear mi cuenta', recover: 'Enviar enlace de recuperación', reset: 'Guardar nueva contraseña' }

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { register, handleSubmit, setError, clearErrors, formState: { errors } } = useForm<Fields>()
  const navigate = useNavigate()
  const location = useLocation()
  const { finishRecovery } = useAuth()
  const mutation = useMutation({
    mutationFn: async (values: unknown): Promise<{ destination?: string; notice?: string }> => {
      if (mode === 'login') { await signIn(values); return { destination: returnPath(location.state) } }
      if (mode === 'register') {
        const { signedIn } = await signUp(values)
        return signedIn ? { destination: returnPath(location.state) } : { notice: 'Revisá tu correo para confirmar la cuenta antes de iniciar sesión.' }
      }
      if (mode === 'recover') {
        await requestPasswordReset(values)
        return { notice: 'Si existe una cuenta con ese correo, recibirás un enlace. Abrilo en este mismo navegador para elegir una nueva contraseña.' }
      }
      await resetPassword(values)
      finishRecovery()
      return { destination: '/perfil' }
    },
    onSuccess: (result) => { if (result.destination) navigate(result.destination, { replace: true }) },
  })

  return (
    <form noValidate className="space-y-5" onSubmit={handleSubmit((values) => {
      clearErrors()
      const result = schemas[mode].safeParse(values)
      if (!result.success) {
        for (const issue of result.error.issues) {
          const field = issue.path[0]
          if (field === 'fullName' || field === 'email' || field === 'password' || field === 'confirmPassword') setError(field, { message: issue.message })
        }
        return
      }
      mutation.mutate(result.data)
    })}>
      <fieldset disabled={mutation.isPending || Boolean(mutation.data?.notice)} className="space-y-5 disabled:opacity-70">
        {mode === 'register' ? <FormField label="Nombre completo" field={register('fullName')} autoComplete="name" error={errors.fullName?.message} /> : null}
        {mode !== 'reset' ? <FormField label="Correo electrónico" type="email" field={register('email')} autoComplete="email" error={errors.email?.message} /> : null}
        {mode !== 'recover' ? <FormField label={mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'} type="password" field={register('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} error={errors.password?.message} /> : null}
        {mode === 'register' || mode === 'reset' ? <>
          <p className="text-xs leading-5 text-muted">Al menos 10 caracteres, con una mayúscula, una minúscula y un número.</p>
          <FormField label="Repetir contraseña" type="password" field={register('confirmPassword')} autoComplete="new-password" error={errors.confirmPassword?.message} />
        </> : null}
        <button className="button-primary w-full disabled:cursor-wait" type="submit">{mutation.isPending ? 'Un momento…' : labels[mode]}</button>
      </fieldset>
      {mutation.isError ? <p role="alert" className="text-sm leading-6 text-clay">{authErrorMessage(mutation.error)}</p> : null}
      {mutation.data?.notice ? <p role="status" className="rounded-lg bg-canvas p-4 text-sm leading-6 text-forest">{mutation.data.notice}</p> : null}
    </form>
  )
}
