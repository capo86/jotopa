import { useFormContext } from 'react-hook-form'
import type { InvitationDesign } from '../models'

type BankingFieldsProps = {
  index: number | null
}

export function BankingFields({ index }: BankingFieldsProps) {
  const { register } = useFormContext<InvitationDesign>()
  const path = index === null ? 'gifts.banking' : `gifts.banking_extra.${index}` as const
  const number = index === null ? 1 : index + 2

  return (
    <fieldset className="space-y-4 rounded-xl border border-line bg-paper p-4">
      <legend className="px-2 text-sm font-medium text-forest">Transferencia {number}</legend>
      <label className="block text-xs font-medium text-forest">Banco o entidad
        <input {...register(`${path}.bank_name`)} maxLength={120} className="form-input mt-2" autoComplete="off" />
      </label>
      <label className="block text-xs font-medium text-forest">Titular de la cuenta
        <input {...register(`${path}.holder`)} maxLength={160} className="form-input mt-2" autoComplete="off" />
      </label>
      <label className="block text-xs font-medium text-forest">Número de cuenta
        <input {...register(`${path}.account`)} maxLength={160} className="form-input mt-2" autoComplete="off" />
      </label>
      <label className="block text-xs font-medium text-forest">Alias para transferencias
        <input {...register(`${path}.alias`)} maxLength={120} className="form-input mt-2" autoComplete="off" />
      </label>
      <label className="block text-xs font-medium text-forest">Indicaciones para transferencias
        <textarea {...register(`${path}.notes`)} maxLength={600} rows={2} className="form-input mt-2" />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-xs font-medium leading-6 text-forest">
        <input type="checkbox" {...register(`${path}.enabled`)} className="size-4 shrink-0 accent-forest" />
        Publicar estos datos de transferencia
      </label>
    </fieldset>
  )
}

