import ExcelJS from 'exceljs'
import type {FinalSeatingRow} from '../models'

export async function writeFinalSeatingWorkbook(rows:FinalSeatingRow[]):Promise<ArrayBuffer>{
  const book=new ExcelJS.Workbook()
  const sheet=book.addWorksheet('Confirmados',{views:[{state:'frozen',ySplit:1}]})
  sheet.columns=[{header:'Destinatario',key:'name',width:35},{header:'Asistentes confirmados',key:'attending_count',width:26},{header:'Mesa',key:'table',width:25},{header:'Grupo',key:'group',width:28}]
  for(const row of rows)sheet.addRow({name:row.name,attending_count:row.attending_count,table:row.table,group:row.group??''})
  sheet.getRow(1).height=30
  sheet.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF244C40'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}}})
  sheet.autoFilter={from:'A1',to:'D1'}
  const totals=new Map<string,{invitations:number;people:number}>()
  for(const row of rows){const item=totals.get(row.table)??{invitations:0,people:0};item.invitations++;item.people+=row.attending_count;totals.set(row.table,item)}
  const summary=book.addWorksheet('Totales por mesa')
  summary.columns=[{header:'Mesa',width:25},{header:'Invitaciones',width:20},{header:'Asistentes',width:20}]
  for(const [table,item] of totals)summary.addRow([table,item.invitations,item.people])
  summary.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF244C40'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}}})
  const bytes=await book.xlsx.writeBuffer()
  return new Uint8Array(new Uint8Array(bytes)).buffer
}