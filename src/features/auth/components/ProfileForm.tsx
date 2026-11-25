import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '../../../lib/database.types'
import { profileSchema } from '../schemas'
import { updateProfile } from '../api'
import { FormField } from './FormField'

export function ProfileForm({ profile }: { profile: Tables<'profiles'> }) {
  const { register, handleSubmit, setError, formState: { errors } } = useForm({ defaultValues: { fullName: profile.full_name } })
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (values: unknown) => updateProfile(profile.user_id, values),
    onSuccess: (data) => { queryClient.setQueryData(['profile', profile.user_id], data) },
  })
  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit((values) => {
      const result = profileSchema.safeParse(values)
      if (!result.success) { setError('fullName', { message: result.error.issues[0]?.message ?? 'Revisá el nombre.' }); return }
      mutation.mutate(result.data)
    })}>
      <FormField label="Nombre completo" field={register('fullName')} autoComplete="name" error={errors.fullName?.message} />
      <button className="button-primary disabled:opacity-60" disabled={mutation.isPending} type="submit">{mutation.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
      {mutation.isError ? <p role="alert" className="text-sm text-clay">No pudimos guardar tu nombre. Intentá de nuevo.</p> : null}
      {mutation.isSuccess ? <p role="status" className="text-sm text-forest">Tu perfil se actualizó.</p> : null}
    </form>
  )
}
