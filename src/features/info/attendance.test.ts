import {test} from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {guestDataSchema,guestFormSchema} from '../guests/validation.ts'
import {readGuestWorkbook} from '../guests/excel.ts'
import {readSeatingWorkbook,writeSeatingWorkbook} from './workbook/index.ts'
import {responseSchema} from '../rsvp/models.ts'

const workbook=async(headers:string[],rows:unknown[][])=>{const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Invitados');sheet.addRow(headers);for(const row of rows)sheet.addRow(row);return new Uint8Array(new Uint8Array(await book.xlsx.writeBuffer())).buffer}
test('total capacity is independent of recipient name and preserves legacy capacity semantics',()=>{
  for(const party_size of [1,2,3,5,21])for(const full_name of ['Juan Pérez','Carlos y María','Familia González'])assert.equal(guestDataSchema.parse({full_name,party_size}).companions_allowed,party_size-1)
  for(const party_size of [0,22,-1,1.5])assert.equal(guestDataSchema.safeParse({full_name:'Nombre libre',party_size}).success,false)
  assert.equal(guestDataSchema.safeParse({full_name:'Familia',party_size:5,companions_allowed:2}).success,false)
  assert.equal(guestFormSchema.parse({full_name:'Una persona',party_size:1,contact_consent:false}).party_size,1)
})
test('new guest workbooks accept total capacity while old sheets keep companions plus one',async()=>{
  const current=await readGuestWorkbook(await workbook(['Destinatario','Cupo total','Grupo o familia'],[['Juan',1,''],['Carlos y María',2,'Pareja'],['Familia González',5,'Familia'],['Inválido',0,'']]))
  assert.deepEqual(current.slice(0,3).map(row=>row.data?.companions_allowed),[0,1,4]);assert.equal(current[3]?.data,null)
  const legacy=await readGuestWorkbook(await workbook(['Nombre','Acompañantes permitidos'],[['Juan',0],['Familia',4],['Vacío','']]))
  assert.deepEqual(legacy.map(row=>row.data?.companions_allowed),[0,4,null])
  const mixed=await readGuestWorkbook(await workbook(['Nombre','Cupo total','Acompañantes permitidos'],[['Conflicto',3,4],['Compatible',3,2]]))
  assert.equal(mixed[0]?.data,null);assert.equal(mixed[1]?.data?.companions_allowed,2)
})
test('binary RSVP requires affirmative totals of at least one and negative totals of zero',()=>{
  for(const attending_count of [1,2,5,21])assert.equal(responseSchema.safeParse({response:'yes',attending_count,expected_version:0}).success,true)
  assert.equal(responseSchema.safeParse({response:'no',attending_count:0,expected_version:2}).success,true)
  for(const patch of [{response:'maybe',attending_count:0},{response:'yes',attending_count:0},{response:'no',attending_count:1},{response:'yes',attending_count:22},{response:'yes',attending_count:1.5}])assert.equal(responseSchema.safeParse({...patch,expected_version:0}).success,false)
})
test('assignment workbook preserves opaque IDs and blank unassignments without exporting contacts',async()=>{
  const guest={id:'80000000-0000-4000-8000-000000000001',full_name:'=Nombre literal',party_size:5,attending_count:3,rsvp_status:'yes' as const,table_id:null,table_name:null}
  const bytes=await writeSeatingWorkbook([guest]),rows=await readSeatingWorkbook(bytes.buffer)
  assert.equal(rows[0]?.data?.guest_id,guest.id);assert.equal(rows[0]?.data?.table_name,'');assert.equal(rows[0]?.data?.email,null)
  const book=new ExcelJS.Workbook();await book.xlsx.load(bytes.buffer);assert.equal(book.getWorksheet('Mesas')?.getCell('B2').type,ExcelJS.ValueType.String)
  const data=await readSeatingWorkbook(await workbook(['Destinatario','Teléfono','Correo','Mesa'],[['Familia','0981123456','','Mesa 8'],['Otro','','same@example.test','Mesa 9'],['Repetido','','SAME@example.test','Mesa 8'],['Sin ID','','','Mesa 8'],['Formula','','',{formula:'1+1',result:2}]]))
  assert.equal(data[0]?.data?.phone,'+595981123456');for(const row of data.slice(1))assert.equal(row.data,null)
})
