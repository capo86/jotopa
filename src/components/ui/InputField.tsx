import { useId } from 'react'
import type { ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'

type Props = { label: string; field: UseFormRegisterReturn; type?: string; error?: string | undefined; children?: ReactNode; hint?: string }
export function InputField({ label, field, type = 'text', error, children, hint }: Props) {
  const id = useId()
  const description = error || hint
  return <div><label htmlFor={id} className="mb-2 block text-sm font-medium text-forest">{label}</label>{children ? <select {...field} id={id} className="form-input" aria-invalid={Boolean(error)} aria-describedby={description ? `${id}-hint` : undefined}>{children}</select> : <input {...field} id={id} type={type} className="form-input" aria-invalid={Boolean(error)} aria-describedby={description ? `${id}-hint` : undefined} />}{description ? <p id={`${id}-hint`} className={`mt-2 text-xs leading-5 ${error ? 'text-clay' : 'text-muted'}`}>{description}</p> : null}</div>
}
