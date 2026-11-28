import {useMutation,useQuery} from '@tanstack/react-query'
import {downloadWorkbook} from '../../guests/worker'
import {attendanceSummary,exportFinalSeating} from '../api'
import {seatingError} from '../models'

export function FinalSeatingExport({eventId}:{eventId:string}){
  const summary=useQuery({queryKey:['attendance',eventId],queryFn:({signal})=>attendanceSummary(eventId,signal),retry:false})
  const ready=Boolean(summary.data&&summary.data.invitations>0&&summary.data.pending_invitations===0&&summary.data.confirmed_invitations>0&&summary.data.confirmed_people===summary.data.assigned_people)
  const download=useMutation({mutationFn:async()=>{const rows=await exportFinalSeating(eventId);const {writeFinalSeatingWorkbook}=await import('../workbook/final-seating-excel');const buffer=await writeFinalSeatingWorkbook(rows);downloadWorkbook(buffer,'jotopa-confirmados-mesas.xlsx')},retry:false})
  return <section className="mt-8 rounded-xl border border-line bg-paper p-5 sm:p-6"><p className="eyebrow">LISTA FINAL</p><h2 className="mt-2 font-display text-2xl text-forest">Confirmados y mesas.</h2><p className="mt-3 text-xs leading-6 text-muted">La descarga se habilita cuando todas las invitaciones respondieron y cada confirmada tiene mesa. Incluye destinatario, cantidad confirmada, mesa y totales por mesa.</p>
    {summary.data?<p className="mt-3 text-sm text-forest">{summary.data.pending_invitations} respuestas pendientes · {Math.max(0,summary.data.confirmed_people-summary.data.assigned_people)} asistentes confirmados sin mesa</p>:null}
    {summary.isFetching?<p role="status" className="mt-3 text-xs text-muted">Revisando respuestas…</p>:null}
    <button type="button" className="button-primary mt-4" disabled={!ready||download.isPending} onClick={()=>download.mutate()}>{download.isPending?'Preparando Excel…':'Descargar confirmados con sus mesas'}</button>
    {summary.isError||download.isError?<p role="alert" className="mt-3 text-sm text-clay">{seatingError(summary.error??download.error)}</p>:null}
  </section>
}