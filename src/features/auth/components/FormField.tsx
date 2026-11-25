import { useId } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'

type Props = {
  label: string
  field: UseFormRegisterReturn
  type?: 'text' | 'email' | 'password'
  autoComplete: string
  error?: string | undefined
}

export function FormField({ label, field, type = 'text', autoComplete, error }: Props) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-forest">{label}</label>
      <input {...field} id={id} type={type} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="form-input" />
      {error ? <p id={`${id}-error`} className="mt-2 text-xs text-clay">{error}</p> : null}
    </div>
  )
}
