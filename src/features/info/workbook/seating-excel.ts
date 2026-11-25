import ExcelJS from 'exceljs'
import {z} from 'zod'
import {validateWorkbookContainer,cellText,guestDataSchema} from '../../guests/workbook/index.ts'
import type {AssignmentRow,SeatingGuest} from '../models.ts'

const headers=['ID invitación','Destinatario','Teléfono','Correo','Documento','Mesa']
const keys=['guest_id','full_name','phone','email','document_id','table_name'] as const
const aliases:Record<string,typeof keys[number]>={'id invitacion':'guest_id',destinatario:'full_name',nombre:'full_name',telefono:'phone',correo:'email',email:'email',documento:'document_id',mesa:'table_name'}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()
export async function readSeatingWorkbook(buffer:ArrayBuffer):Promise<AssignmentRow[]>{
  validateWorkbookContainer(buffer)
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer)
  const sheet=book.getWorksheet('Mesas')??book.worksheets[0]
  if(!sheet||sheet.rowCount<2)throw new Error('empty_workbook')
  if(sheet.rowCount>1001||sheet.columnCount>20)throw new Error('row_limit')
  const columns=new Map<number,typeof keys[number]>(),used=new Set<string>()
  sheet.getRow(1).eachCell((cell,index)=>{const key=aliases[normalize(cellText(cell.value))];if(!key||used.has(key))throw new Error('invalid_headers');columns.set(index,key);used.add(key)})
  if(!used.has('table_name')||!['guest_id','phone','email','document_id'].some(key=>used.has(key)))throw new Error('invalid_headers')
  const rows:AssignmentRow[]=[]
  sheet.eachRow((row,rowNumber)=>{
    if(rowNumber===1)return
    const raw:Record<string,string>={},errors:string[]=[]
    row.eachCell((_,column)=>{if(!columns.has(column))errors.push('Hay datos en una columna sin título.')})
    for(const [column,key] of columns){try{raw[key]=cellText(row.getCell(column).value)}catch{errors.push('No se permiten fórmulas, fechas ni vínculos.')}}
    if(!Object.values(raw).some(Boolean)&&!errors.length)return
    const contacts=guestDataSchema.safeParse({full_name:'Assignment',phone:raw.phone??'',email:raw.email??'',document_id:raw.document_id??''})
    const id=z.union([z.uuid(),z.literal('')]).safeParse(raw.guest_id??'')
    if(!contacts.success)errors.push(...contacts.error.issues.map(issue=>issue.message))
    if(!id.success)errors.push('ID de invitación inválido.')
    if((raw.table_name??'').length>80)errors.push('El nombre de mesa admite hasta 80 caracteres.')
    if(contacts.success&&id.success&&!id.data&&!contacts.data.phone&&!contacts.data.email&&!contacts.data.document_id)errors.push('Ingresá un ID, teléfono, correo o documento. El nombre no identifica la invitación.')
    const data=contacts.success&&id.success&&!errors.length?{guest_id:id.data||null,phone:contacts.data.phone,email:contacts.data.email,document_id:contacts.data.document_id,table_name:raw.table_name??''}:null
    rows.push({rowNumber,cells:keys.map(key=>(raw[key]??'').slice(0,160)),data,errors})
  })
  if(!rows.length)throw new Error('empty_workbook')
  // Server independently detects identities resolving to the same invitation.
  const seen=new Map<string,number>()
  for(const row of rows)if(row.data)for(const field of ['guest_id','phone','email','document_id'] as const){const value=row.data[field];if(value){const key=`${field}:${value}`;seen.set(key,(seen.get(key)??0)+1)}}
  return rows.map(row=>row.data&&(['guest_id','phone','email','document_id'] as const).some(field=>row.data?.[field]&&(seen.get(`${field}:${row.data[field]}`)??0)>1)?{...row,data:null,errors:[...row.errors,'Repite un identificador en el archivo.']}:row)
}
export async function writeSeatingWorkbook(guests:SeatingGuest[]=[]):Promise<Uint8Array<ArrayBuffer>>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Mesas',{views:[{state:'frozen',ySplit:1}]})
  sheet.columns=headers.map((header,index)=>({header,width:[40,32,24,34,24,24][index]??24,style:{numFmt:'@'}}))
  sheet.getRow(1).height=30;sheet.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF244C40'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}}})
  sheet.autoFilter={from:'A1',to:'F1'}
  for(const guest of guests)sheet.addRow([guest.id,guest.full_name,'','','',guest.table_name??''])
  const guide=book.addWorksheet('Instrucciones');guide.columns=[{width:28},{width:105}]
  for(const row of [['Jotopa · Asignación de mesas','Una fila por invitación completa. Máximo 1.000 filas y 2 MB.'],['Identificación','Conservá el ID de invitación descargado. Si no lo tenés, usá teléfono, correo o documento con permiso de contactos. No se concilia por nombre.'],['Mesa','Escribí el nombre exacto de una mesa creada en el evento (sin distinguir mayúsculas). Dejar Mesa vacía quita su asignación.'],['Contenido sin contactos','El rol Contenido debe usar el ID. No completar teléfonos, correos ni documentos.'],['Vista previa','Revisá asignaciones y errores antes de guardar. Las válidas se aplican juntas; una falla inesperada revierte todo el lote.'],['Seguridad','No usar fórmulas, vínculos ni macros. No compartir esta planilla fuera del equipo autorizado.']]){const added=guide.addRow(row);added.height=55;added.eachCell(cell=>{cell.alignment={wrapText:true,vertical:'middle'}})}
  const bytes=await book.xlsx.writeBuffer();return new Uint8Array(new Uint8Array(bytes))
}
