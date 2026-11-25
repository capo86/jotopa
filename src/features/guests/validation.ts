import { z } from 'zod'
import { parsePhoneNumberWithError } from 'libphonenumber-js/max'

export function normalizePhone(input: string): string | null {
  let value = input.trim()
  if (!value) return null
  if (value.length > 80 || !/^[+0-9\s().-]+$/.test(value)) throw new Error('invalid_phone')
  value = value.replace(/^00/, '+')
  const digits = value.replace(/[\s().-]/g, '')
  if (!digits.startsWith('+') && digits.startsWith('595') && digits.length > 10) value = `+${digits}`
  const number = parsePhoneNumberWithError(value, { defaultCountry: 'PY', extract: false })
  if (!number.isValid() || number.ext) throw new Error('invalid_phone')
  return number.number
}

const optionalText = (max: number) => z.string().trim().max(max, `Usá hasta ${max} caracteres.`).transform(value => value || null).nullable().default(null)
const phone = z.string().max(80, 'El teléfono es demasiado largo.').transform((value, context) => {
  try { return normalizePhone(value) } catch { context.addIssue({ code: 'custom', message: 'Ingresá un teléfono válido. Sin prefijo se usa +595.' }); return z.NEVER }
}).nullable().default(null)
const email = optionalText(254).pipe(z.email('Ingresá un correo válido.').toLowerCase().nullable())
const document = z.string().trim().transform((value, context) => {
  if (!value) return null
  const normalized = value.toUpperCase().replace(/[ .-]/g, '')
  if (!/^[A-Za-z0-9 .-]+$/.test(value) || !/^[A-Z0-9]{3,40}$/.test(normalized)) {
    context.addIssue({ code: 'custom', message: 'Usá entre 3 y 40 letras o números en el documento.' }); return z.NEVER
  }
  return normalized
}).nullable().default(null)

const guestBaseSchema = z.object({
  full_name: z.string().trim().min(2, 'Ingresá al menos 2 caracteres.').max(160, 'Usá hasta 160 caracteres.'),
  phone, email, document_id: document, group_label: optionalText(80),
  companions_allowed: z.number({ error: 'Ingresá un número entero entre 0 y 20.' }).int('Ingresá un número entero.').min(0, 'La cantidad no puede ser negativa.').max(20, 'El máximo es 20 acompañantes.').nullable().default(null),
  contact_consent: z.boolean({ error: 'Usá Sí, No o dejá la celda vacía.' }).nullable().default(null),
}).strict()
const capacitySchema=z.number({error:'Ingresá un cupo entero entre 1 y 21.'}).int('Ingresá un número entero.').min(1,'El cupo incluye al destinatario y debe ser al menos uno.').max(21,'El máximo es 21 personas por invitación.')
export const guestDataSchema=guestBaseSchema.extend({party_size:capacitySchema.nullable().optional()}).superRefine((data,context)=>{
  if(data.party_size!=null&&data.companions_allowed!=null&&data.party_size!==data.companions_allowed+1)context.addIssue({code:'custom',path:['party_size'],message:'El cupo total y los acompañantes de la planilla anterior no coinciden.'})
}).transform(({party_size,...data})=>({...data,companions_allowed:party_size!=null?party_size-1:data.companions_allowed}))
export const guestFormSchema = guestBaseSchema.omit({companions_allowed:true}).extend({
  party_size: capacitySchema,
  contact_consent: z.boolean(),
})
export type GuestPayload = z.output<typeof guestDataSchema>
export type GuestFormValues = { full_name: string; phone: string; email: string; document_id: string; group_label: string; party_size: number; contact_consent: boolean }

export type ImportRow = { rowNumber: number; cells: string[]; data: GuestPayload | null; errors: string[] }
export function flagFileDuplicates(rows: ImportRow[]): ImportRow[] {
  const keys = new Map<string, number[]>()
  for (const row of rows) if (row.data) for (const field of ['email','phone','document_id'] as const) {
    const value = row.data[field]
    if (value) { const key = `${field}:${value}`; keys.set(key, [...(keys.get(key) ?? []), row.rowNumber]) }
  }
  const duplicates = new Set([...keys.values()].filter(numbers => numbers.length > 1).flat())
  return rows.map(row => duplicates.has(row.rowNumber) ? { ...row, data: null, errors: [...row.errors, 'Repite un correo, teléfono o documento en este archivo.'] } : row)
}
