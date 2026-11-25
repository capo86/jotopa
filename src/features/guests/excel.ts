import ExcelJS from 'exceljs'
import type { CellValue } from 'exceljs'
import { flagFileDuplicates, guestDataSchema } from './validation.ts'
import type { ImportRow } from './validation.ts'
import type { Guest } from './models.ts'

export const EXCEL_HEADERS = ['Destinatario','Teléfono','Correo','Documento','Grupo o familia','Cupo total','Consentimiento'] as const
const widths = [32,23,34,22,24,29,24]
const fieldNames = ['full_name','phone','email','document_id','group_label','party_size','contact_consent'] as const
type WorkbookField=typeof fieldNames[number]|'companions_allowed'
const aliases: Record<string, WorkbookField> = {
  nombre: 'full_name', 'nombre completo': 'full_name', telefono: 'phone', correo: 'email', email: 'email', 'correo electronico': 'email', documento: 'document_id', grupo: 'group_label', 'acompanantes permitidos': 'companions_allowed', consentimiento: 'contact_consent',
  destinatario:'full_name','grupo o familia':'group_label',familia:'group_label','cupo total':'party_size',cupo:'party_size',
}
const normalizeHeader = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

// Reject oversized, encrypted, ZIP64 or non-workbook containers before ExcelJS
// decompresses them. Parsing is additionally isolated in a disposable worker.
export function validateWorkbookContainer(buffer: ArrayBuffer) {
  if (buffer.byteLength > 2 * 1024 * 1024 || buffer.byteLength < 22) throw new Error('file_size')
  const view = new DataView(buffer)
  let end = -1
  for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break }
  }
  if (end < 0) throw new Error('invalid_workbook')
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true)
  if (!count || count > 2000 || start + size > end) throw new Error('invalid_workbook')
  let offset = start, uncompressed = 0
  const names = new Set<string>()
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50 || (view.getUint16(offset + 8, true) & 1)) throw new Error('invalid_workbook')
    const length = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true)
    const originalSize = view.getUint32(offset + 24, true)
    uncompressed += originalSize
    if (originalSize > 10 * 1024 * 1024 || uncompressed > 20 * 1024 * 1024 || offset + 46 + length + extra + comment > end) throw new Error('file_size')
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, length)).toLowerCase()
    if (name.includes('vbaproject') || name.startsWith('xl/externallinks/') || name.startsWith('xl/embeddings/')) throw new Error('unsupported_workbook')
    names.add(name)
    offset += 46 + length + extra + comment
  }
  if (!names.has('[content_types].xml') || !names.has('xl/workbook.xml')) throw new Error('invalid_workbook')
}

export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) < 1e15) return String(value)
  if (typeof value === 'object' && 'richText' in value) return value.richText.map(part => part.text).join('').trim()
  throw new Error('Usá valores de texto o números enteros; no fórmulas, fechas ni vínculos.')
}

export async function readGuestWorkbook(buffer: ArrayBuffer): Promise<ImportRow[]> {
  validateWorkbookContainer(buffer)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.getWorksheet('Invitados') ?? workbook.worksheets[0]
  if (!sheet || sheet.rowCount < 2) throw new Error('empty_workbook')
  if (sheet.rowCount > 1001 || sheet.columnCount > 20) throw new Error('row_limit')
  const columns = new Map<number, WorkbookField>()
  const used = new Set<string>()
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const field = aliases[normalizeHeader(cellText(cell.value))]
    if (!field || used.has(field)) throw new Error('invalid_headers')
    used.add(field); columns.set(column, field)
  })
  if (!used.has('full_name')) throw new Error('invalid_headers')
  const rows: ImportRow[] = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || !row.hasValues) return
    const raw: Record<string, string> = {}, errors: string[] = []
    row.eachCell({ includeEmpty: false }, (_cell, column) => { if (!columns.has(column)) errors.push('Hay datos en una columna sin título.') })
    for (const [column, field] of columns) {
      try { raw[field] = cellText(row.getCell(column).value) } catch { errors.push('No se permiten fórmulas, fechas, vínculos ni números de más de 15 dígitos.') }
    }
    if (!Object.values(raw).some(Boolean) && !errors.length) return
    const companions = raw.companions_allowed?.trim() ?? ''
    const capacity=raw.party_size?.trim()??''
    const consent = normalizeHeader(raw.contact_consent ?? '')
    const parsed = guestDataSchema.safeParse({
      full_name: raw.full_name ?? '', phone: raw.phone ?? '', email: raw.email ?? '', document_id: raw.document_id ?? '', group_label: raw.group_label ?? '',
      companions_allowed: companions ? Number(companions) : null,
      party_size:capacity?Number(capacity):null,
      contact_consent: !consent ? null : ['si','true','1'].includes(consent) ? true : ['no','false','0'].includes(consent) ? false : consent,
    })
    if (!parsed.success) for (const issue of parsed.error.issues) errors.push(`${EXCEL_HEADERS[fieldNames.indexOf(issue.path[0] as typeof fieldNames[number])] ?? 'Dato'}: ${issue.message}`)
    rows.push({ rowNumber, cells: fieldNames.map(field => (field==='party_size'&&!capacity&&companions?String(Number(companions)+1):raw[field]??'').slice(0,160)), data: parsed.success && !errors.length ? parsed.data : null, errors: [...new Set(errors)] })
  })
  if (!rows.length) throw new Error('empty_workbook')
  return flagFileDuplicates(rows)
}

function guestWorkbook() {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Jotopa'
  const sheet = workbook.addWorksheet('Invitados', { properties: { tabColor: { argb: 'FF244C40' } }, views: [{ state: 'frozen', xSplit: 1, ySplit: 1, showGridLines: false }] })
  sheet.columns = EXCEL_HEADERS.map((header, index) => ({ header, width: widths[index] ?? 24, style: { font: { name: 'Aptos', size: 11 }, alignment: { vertical: 'middle' }, numFmt: index === 5 ? '0' : '@' } }))
  const header = sheet.getRow(1)
  header.height = 34
  header.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244C40' } }; cell.font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true } })
  sheet.autoFilter = { from: 'A1', to: 'G1' }
  for (let row = 2; row <= 1001; row++) {
    sheet.getCell(`F${row}`).dataValidation = { type: 'whole', operator: 'between', formulae: [1, 21], allowBlank: true, showErrorMessage: true, errorTitle: 'Cantidad inválida', error: 'Ingresá un entero entre 1 y 21, incluyendo al destinatario.' }
    sheet.getCell(`G${row}`).dataValidation = { type: 'list', formulae: ['"Sí,No"'], allowBlank: true, showErrorMessage: true, error: 'Elegí Sí o No, o dejá la celda vacía.' }
  }
  const guide = workbook.addWorksheet('Instrucciones', { views: [{ showGridLines: false }] })
  guide.columns = [{ width: 31 }, { width: 105 }]
  guide.addRow(['Jotopa · Invitados'])
  guide.getCell('A1').font = { name: 'Aptos', size: 16, bold: true, color: { argb: 'FF244C40' } }
  guide.getRow(1).height = 28
  guide.addRow([])
  const notes = [
    ['Cómo completar', 'Completá una invitación por fila en Invitados, desde la fila 2. Conservá los encabezados.'],
    ['Destinatario', 'Obligatorio, de 2 a 160 caracteres. Puede ser una persona, pareja o familia, independientemente del cupo. No se concilia por nombre.'],
    ['Teléfono', 'Usá texto para conservar el signo + y los ceros. Sin prefijo se interpreta como Paraguay (+595).'],
    ['Correo', 'Opcional. Se normaliza a minúsculas.'],
    ['Documento', 'Opcional. Se conserva como texto, en mayúsculas, sin puntos, espacios ni guiones.'],
    ['Grupo', 'Opcional, hasta 80 caracteres. Por ejemplo, Familia o Trabajo.'],
    ['Cupo total', 'Entero entre 1 y 21, incluyendo al destinatario principal. Vacío: uno en un alta; conserva el cupo al actualizar. Las planillas anteriores con Acompañantes permitidos siguen aceptadas y se convierten sumando uno.'],
    ['Consentimiento', 'Sí, No o vacío. No marques Sí sin autorización. Vacío conserva el valor al actualizar; en un alta empieza en No.'],
    ['Cómo se concilia', 'Se busca coincidencia por correo, teléfono o documento dentro de este evento. Si apuntan a personas diferentes, la fila se rechaza.'],
    ['Celdas vacías', 'Al actualizar se conservan los contactos y el grupo existentes. Para borrarlos, usá Editar invitado en Jotopa.'],
    ['Sin identificadores', 'Si no hay correo, teléfono ni documento, se crea una persona nueva. Volver a importar el archivo como lote nuevo vuelve a crearla.'],
    ['Duplicados', 'Se rechazan las filas que repiten identificadores en el archivo o intentan actualizar a una misma persona más de una vez.'],
    ['Antes de importar', 'Revisá la vista previa y los errores por fila. No uses fórmulas, vínculos, macros ni celdas de fecha.'],
    ['Límites', 'Solo .xlsx, hasta 2 MB y 1.000 filas por lote. Excel puede redondear números de más de 15 dígitos: guardá documentos y teléfonos como texto.'],
  ]
  for (const values of notes) {
    const row = guide.addRow(values); row.height = 42
    row.eachCell((cell, column) => { cell.font = { name: 'Aptos', size: 11, ...(column === 1 ? { bold: true, color: { argb: 'FF244C40' } } : {}) }; cell.alignment = { vertical: 'middle', wrapText: true } })
  }
  return { workbook, sheet }
}

export async function writeGuestWorkbook(guests: Guest[] = []): Promise<Uint8Array<ArrayBuffer>> {
  const { workbook, sheet } = guestWorkbook()
  for (const [index, guest] of guests.entries()) {
    const row = sheet.getRow(index + 2)
    row.values = [guest.full_name, guest.phone ?? '', guest.email ?? '', guest.document_id ?? '', guest.group_label ?? '', guest.party_size, guest.contact_consent ? 'Sí' : 'No']
    row.height = 24
  }
  const bytes = await workbook.xlsx.writeBuffer()
  return new Uint8Array(new Uint8Array(bytes))
}
