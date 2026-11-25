import assert from 'node:assert/strict'
import { test } from 'node:test'
import ExcelJS from 'exceljs'
import { normalizePhone, guestDataSchema } from './validation.ts'
import { EXCEL_HEADERS, readGuestWorkbook, writeGuestWorkbook } from './excel.ts'
import type { Guest } from './models.ts'

test('international phone validation and normalization with Paraguay default', () => {
  for (const input of ['0981 123456','981123456','595981123456','00595 981 123456','+595 (981) 123-456']) assert.equal(normalizePhone(input),'+595981123456')
  assert.equal(normalizePhone('+1 202-555-0123'),'+12025550123')
  assert.equal(normalizePhone('+44 20 7946 0018'),'+442079460018')
  assert.equal(normalizePhone(''),null)
  for (const phone of ['123','+999123456789','not a phone','+595981123456 ext 9','++595981123456']) assert.throws(()=>normalizePhone(phone))
  assert.equal(guestDataSchema.safeParse({full_name:'A',email:'invalid'}).success,false)
  assert.equal(guestDataSchema.safeParse({full_name:'Valid',companions_allowed:1.5}).success,false)
  assert.equal(guestDataSchema.safeParse({full_name:'Valid',companions_allowed:21}).success,false)
  assert.equal(guestDataSchema.safeParse({full_name:'Valid',invite_token:'not allowed'}).success,false)
})

const bytesOf = async (rows: unknown[][]) => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Invitados')
  sheet.addRow(['Nombre','Teléfono','Correo','Documento','Grupo','Acompañantes permitidos','Consentimiento']); for(const row of rows) sheet.addRow(row)
  const bytes = await book.xlsx.writeBuffer(); return new Uint8Array(new Uint8Array(bytes)).buffer
}
test('Excel preview validates every row, rejects formulas and all duplicate identities',async()=>{
  const rows = await readGuestWorkbook(await bytesOf([
    ['Correcto','0981123456','UPPER@EXAMPLE.TEST','1.234.567','Familia',0,'Sí'],
    ['Sin contactos','','','','','',''],
    ['Error','123','invalid','','',21,'Quizá'],
    ['Duplicado 1','','same@example.test'], ['Duplicado 2','','SAME@example.test'],
    [{formula:'HYPERLINK("https://example.test","Formula")',result:'Formula'}],
  ]))
  assert.equal(rows.length,6); assert.equal(rows[0]?.data?.phone,'+595981123456'); assert.equal(rows[0]?.data?.email,'upper@example.test')
  assert.equal(rows[0]?.data?.document_id,'1234567'); assert.equal(rows[0]?.data?.contact_consent,true);assert.equal(rows[0]?.data?.companions_allowed,0)
  assert.equal(rows[1]?.data?.companions_allowed,null);assert.equal(rows[1]?.data?.contact_consent,null)
  for(const row of rows.slice(2)) {assert.equal(row.data,null);assert.ok(row.errors.length)}
})
test('template formatting, validation and export roundtrip preserve literal text and zero values',async()=>{
  const template = await writeGuestWorkbook(), book = new ExcelJS.Workbook()
  await book.xlsx.load(template.buffer)
  const sheet = book.getWorksheet('Invitados')!
  assert.deepEqual(EXCEL_HEADERS.map((_,index)=>sheet.getRow(1).getCell(index+1).value),EXCEL_HEADERS)
  assert.equal(sheet.getCell('B2').numFmt,'@');assert.equal(sheet.getCell('F2').dataValidation.type,'whole');assert.equal(sheet.getCell('G2').dataValidation.type,'list')
  assert.equal(sheet.views[0]?.state,'frozen');assert.equal(sheet.getColumn(2).width,23)
  assert.ok(book.getWorksheet('Instrucciones')!.getCell('B9').text.length>20)
  await assert.rejects(readGuestWorkbook(template.buffer),/empty_workbook/)
  const guest: Guest = {party_size:1,attending_count:0,table_id:null,table_name:null,rsvp_status:'pending',rsvp_at:null,companions_confirmed:0,opted_out:false,rsvp_version:0,id:'30000000-0000-4000-8000-000000000001',event_id:'30000000-0000-4000-8000-000000000002',full_name:'=literal, no fórmula',email:null,phone:'+595981123456',document_id:'001234',group_label:'Familia',companions_allowed:0,contact_consent:false,created_at:'2026-11-22T00:00:00Z',updated_at:'2026-11-22T00:00:00Z'}
  const exported = await writeGuestWorkbook([guest]), reopened = new ExcelJS.Workbook();await reopened.xlsx.load(exported.buffer)
  assert.equal(reopened.getWorksheet('Invitados')!.getCell('A2').type,ExcelJS.ValueType.String)
  const rows = await readGuestWorkbook(exported.buffer)
  assert.equal(rows.length,1);assert.equal(rows[0]?.data?.document_id,'001234');assert.equal(rows[0]?.data?.phone,guest.phone);assert.equal(rows[0]?.data?.companions_allowed,0)
})
test('corrupt, oversized, excessive-row and invalid-header files are rejected',async()=>{
  await assert.rejects(readGuestWorkbook(new ArrayBuffer(2*1024*1024+1)),/file_size/)
  await assert.rejects(readGuestWorkbook(new ArrayBuffer(100)),/invalid_workbook/)
  await assert.rejects(readGuestWorkbook(await bytesOf(Array.from({length:1001},()=>['Person']))),/row_limit/)
  const book = new ExcelJS.Workbook();book.addWorksheet('Invitados').addRows([['Unknown'],['Person']])
  const bytes=await book.xlsx.writeBuffer();await assert.rejects(readGuestWorkbook(new Uint8Array(new Uint8Array(bytes)).buffer),/invalid_headers/)
})
