import { readGuestWorkbook, writeGuestWorkbook } from './excel'
import type { Guest } from './models'
import type {SeatingGuest} from '../info/workbook'

export type ExcelRequest = { kind: 'parse'; buffer: ArrayBuffer } | { kind: 'template' } | { kind: 'export'; guests: Guest[] } | {kind:'parse_tables';buffer:ArrayBuffer} | {kind:'template_tables';guests:SeatingGuest[]}
self.onmessage = async (event: MessageEvent<ExcelRequest>) => {
  try {
    if(event.data.kind==='parse_tables'||event.data.kind==='template_tables'){
      const {readSeatingWorkbook,writeSeatingWorkbook}=await import('../info/workbook/index')
      if(event.data.kind==='parse_tables')self.postMessage({ok:true,rows:await readSeatingWorkbook(event.data.buffer)})
      else{const bytes=await writeSeatingWorkbook(event.data.guests);self.postMessage({ok:true,buffer:bytes.buffer},{transfer:[bytes.buffer]})}
      return
    }
    if (event.data.kind === 'parse') {
      const rows = await readGuestWorkbook(event.data.buffer)
      self.postMessage({ ok: true, rows })
    } else {
      const bytes = await writeGuestWorkbook(event.data.kind === 'export' ? event.data.guests : [])
      self.postMessage({ ok: true, buffer: bytes.buffer }, { transfer: [bytes.buffer] })
    }
  } catch (error) {
    const allowed = ['file_size','invalid_workbook','unsupported_workbook','row_limit','invalid_headers','empty_workbook']
    self.postMessage({ ok: false, code: error instanceof Error && allowed.includes(error.message) ? error.message : 'invalid_workbook' })
  }
}
