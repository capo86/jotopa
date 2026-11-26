import { PALETTES } from '../models'
import type { InvitationDesign } from '../models'

type PaletteBalanceProps = {
  palette: InvitationDesign['palette']
  value: InvitationDesign['palette_mix']
  onChange: (value: InvitationDesign['palette_mix']) => void
}

const colorNames = ['Principal', 'Suave', 'Acento'] as const

export function PaletteBalance({ palette, value, onChange }: PaletteBalanceProps) {
  const colors = PALETTES[palette]
  const swatches = [colors.ink, colors.soft, colors.accent]

  const change = (index: number, requested: number) => {
    const next = [...value] as InvitationDesign['palette_mix']
    const amount = Math.max(0, Math.min(100, Math.round(requested)))
    const difference = amount - next[index]
    next[index] = amount
    let remaining = Math.abs(difference)

    for (const offset of [1, 2]) {
      const other = (index + offset) % 3
      const available = difference > 0 ? next[other] : 100 - next[other]
      const portion = Math.min(remaining, available)
      next[other] += difference > 0 ? -portion : portion
      remaining -= portion
    }
    onChange(next)
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-line p-4">
      <p className="text-xs font-medium text-forest">Proporción de colores · total 100 %</p>
      <div className="flex h-4 overflow-hidden rounded-full" aria-hidden="true">
        {swatches.map((color, index) => <span key={color} style={{ background: color, width: `${value[index]}%` }} />)}
      </div>
      {colorNames.map((name, index) => (
        <label key={name} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs text-forest">
          <span className="flex min-w-18 items-center gap-2"><i className="size-3 rounded-full" style={{ background: swatches[index] }} />{name}</span>
          <input type="range" min="0" max="100" step="1" value={value[index]} onChange={event => change(index, Number(event.target.value))} aria-label={`${name} de la paleta`} className="w-full accent-forest" />
          <span className="w-9 text-right tabular-nums">{value[index]} %</span>
        </label>
      ))}
    </div>
  )
}
