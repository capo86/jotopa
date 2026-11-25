import { z } from 'zod'
import { utcDateTime } from './dates.ts'

export const EVENT_TYPES = ['wedding','birthday','anniversary','other'] as const
export const EVENT_STATUSES = ['draft','active','closed'] as const
export const eventFormSchema = z.object({
  title: z.string().trim().min(2, 'Ingresá al menos 2 caracteres.').max(160, 'Usá hasta 160 caracteres.'),
  slug: z.string().min(3, 'Ingresá al menos 3 caracteres.').max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Usá letras minúsculas, números y guiones entre palabras.'),
  type: z.enum(EVENT_TYPES), startsAt: z.string(), timezone: z.string(), rsvpDeadline: z.string().min(1, 'Definí la fecha y hora límite de confirmación.'), status: z.enum(EVENT_STATUSES),
}).superRefine((data, context) => {
  let start: string | undefined
  try { start = utcDateTime(data.startsAt, data.timezone) } catch { context.addIssue({ code: 'custom', path: ['startsAt'], message: 'Ingresá una fecha y una zona horaria válidas.' }) }
  if (data.rsvpDeadline) {
    try {
      const deadline = utcDateTime(data.rsvpDeadline, data.timezone)
      if (start && deadline > start) context.addIssue({ code: 'custom', path: ['rsvpDeadline'], message: 'La fecha límite debe ser anterior o igual al evento.' })
    } catch { context.addIssue({ code: 'custom', path: ['rsvpDeadline'], message: 'Ingresá una fecha límite válida.' }) }
  }
})
export type EventFormValues = z.infer<typeof eventFormSchema>
export const TYPE_LABELS = { wedding: 'Casamiento', birthday: 'Cumpleaños', anniversary: 'Aniversario', other: 'Otro encuentro' }
export const STATUS_LABELS = { draft: 'Borrador', active: 'Activo', closed: 'Cerrado' }
