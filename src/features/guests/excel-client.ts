import type { ImportRow } from './validation'
import type { ExcelRequest } from './excel.worker'
import type {AssignmentRow} from '../info/workbook'

type ExcelResult = { rows?: ImportRow[]; buffer?: ArrayBuffer }
export function excelTask(request:Extract<ExcelRequest,{kind:'parse_tables'}>):Promise<{rows?:AssignmentRow[]}>
export function excelTask(request:Exclude<ExcelRequest,{kind:'parse_tables'}>):Promise<ExcelResult>
export function excelTask(request: ExcelRequest): Promise<ExcelResult|{rows?:AssignmentRow[]}> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { clearTimeout(timeout); worker.terminate() }
    const timeout = setTimeout(() => { finish(); reject(new Error('excel_timeout')) }, 15_000)
    worker.onmessage = (event: MessageEvent<{ ok: boolean; code?: string; rows?: ImportRow[]; buffer?: ArrayBuffer }>) => {
      finish()
      if (!event.data.ok) reject(new Error(event.data.code ?? 'invalid_workbook'))
      else resolve(event.data)
    }
    worker.onerror = () => { finish(); reject(new Error('invalid_workbook')) }
    worker.postMessage(request, request.kind === 'parse'||request.kind==='parse_tables' ? [request.buffer] : [])
  })
}
export function downloadWorkbook(buffer: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function excelError(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  const messages: Record<string, string> = {
    file_size: 'Usá un archivo de hasta 2 MB, sin contenido comprimido excesivo.',
    row_limit: 'La importación admite hasta 1.000 filas y 20 columnas por archivo.',
    invalid_headers: 'Los encabezados no coinciden con la plantilla o están repetidos. Descargá la plantilla de Jotopa.',
    empty_workbook: 'El archivo no contiene invitados para importar.',
    unsupported_workbook: 'No se admiten macros, objetos incrustados ni vínculos externos.',
    excel_timeout: 'El archivo tardó demasiado en procesarse. Probá con un archivo más pequeño.',
  }
  return messages[code] ?? 'No pudimos leer el archivo. Usá una plantilla .xlsx válida.'
}
