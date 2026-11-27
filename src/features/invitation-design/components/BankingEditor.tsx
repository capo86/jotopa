import { useFieldArray, useFormContext } from 'react-hook-form'
import type { InvitationDesign } from '../models'
import { emptyBanking } from '../information-models'
import { BankingFields } from './BankingFields'

export function BankingEditor({ onAdd }: { onAdd: () => void }) {
  const { control } = useFormContext<InvitationDesign>()
  const extra = useFieldArray({ control, name: 'gifts.banking_extra', keyName: 'fieldKey' })

  return (
    <div className="space-y-4 rounded-xl border border-sand bg-canvas p-4">
      <p className="text-sm font-medium text-forest">Datos para transferencias</p>
      <p className="text-xs leading-6 text-muted">Cada cuenta se publica por separado cuando la habilitás y publicás la invitación con la sección Regalos activa.</p>
      <BankingFields index={null} />
      {extra.fields.map((entry, index) => (
        <div key={entry.fieldKey}>
          <BankingFields index={index} />
          <button type="button" className="mt-2 min-h-11 text-xs text-clay underline" onClick={() => extra.remove(index)}>
            Eliminar transferencia {index + 2}
          </button>
        </div>
      ))}
      <button type="button" disabled={extra.fields.length >= 4} className="min-h-11 text-sm text-forest underline disabled:opacity-50" onClick={() => { extra.append(emptyBanking()); onAdd() }}>
        Agregar otro dato de transferencia
      </button>
      <p className="text-xs leading-6 text-muted">Para publicar una cuenta, completá el titular y el número de cuenta o alias.</p>
    </div>
  )
}

