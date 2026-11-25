import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { importGuests } from '../api'
import { guestError, importReason } from '../models'
import { downloadWorkbook, excelError, excelTask } from '../excel-client'
import { Pagination } from './Pagination'

const headers = ['Destinatario', 'Teléfono', 'Correo', 'Documento', 'Grupo o familia', 'Cupo total', 'Consentimiento']
export function ImportWorkspace({ eventId, title }: { eventId: string; title: string }) {
  const [page, setPage] = useState(0)
  const cache = useQueryClient()
  const template = useMutation({ mutationFn: async () => { const result = await excelTask({ kind: 'template' }); if (result.buffer) downloadWorkbook(result.buffer, 'jotopa-plantilla-invitados.xlsx') } })
  const preview = useMutation({ mutationFn: async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('invalid_workbook')
    if (file.size > 2 * 1024 * 1024) throw new Error('file_size')
    const result = await excelTask({ kind: 'parse', buffer: await file.arrayBuffer() })
    if (!result.rows) throw new Error('invalid_workbook')
    const batchId = crypto.randomUUID()
    const report = await importGuests(eventId, result.rows, batchId, true)
    return { rows: result.rows, batchId, report, filename: file.name }
  } })
  const commit = useMutation({ mutationFn: async () => {
    if (!preview.data) throw new Error('invalid_import')
    return importGuests(eventId, preview.data.rows, preview.data.batchId, false)
  }, onSuccess: async () => { await cache.invalidateQueries({ queryKey: ['guests', eventId] }) } })
  const report = commit.data ?? preview.data?.report
  const rows = preview.data?.rows ?? []
  const statuses = new Map(report?.rows.map(row => [row.row_number, row]))
  const busy = preview.isPending || commit.isPending
  const error = preview.error ?? commit.error ?? template.error
  return <section className="max-w-6xl">
    <Link to={`/eventos/${eventId}/invitados`} className="text-sm text-forest underline underline-offset-4">Volver a invitados</Link>
    <p className="eyebrow mt-8 break-words">{title} · EXCEL</p><h1 className="mt-3 font-display text-4xl text-forest sm:text-5xl">Tu lista, en un paso.</h1>
    <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">Subí tu archivo y revisá cada fila antes de guardar. Buscamos coincidencias por correo, teléfono y documento dentro de este evento. Las coincidencias ambiguas se rechazan para que puedas resolverlas.</p>
    <div className="my-7 grid gap-5 rounded-xl border border-line bg-paper p-5 sm:grid-cols-2 sm:p-7"><div><p className="eyebrow">01 · PREPARÁ TU ARCHIVO</p><p className="my-3 text-sm leading-6 text-muted">Solo .xlsx, hasta 2 MB y 1.000 personas. El nombre es obligatorio. Guardá teléfonos y documentos como texto.</p><button type="button" className="min-h-11 text-sm text-forest underline underline-offset-4" disabled={template.isPending} onClick={() => template.mutate()}>{template.isPending ? 'Preparando…' : 'Descargar plantilla Excel'}</button></div><div><label htmlFor="guest-file" className="eyebrow">02 · REVISÁ LA VISTA PREVIA</label><input id="guest-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} className="mt-4 block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-canvas file:px-3 file:text-forest" onChange={event => {
      const file = event.currentTarget.files?.[0]; commit.reset(); preview.reset(); setPage(0)
      if (file) preview.mutate(file)
    }} /><p className="mt-3 text-xs leading-5 text-muted">El archivo se analiza en tu navegador. La validación y conciliación final se verifican en el servidor.</p></div></div>
    <details className="mb-7 text-sm leading-6 text-muted"><summary className="cursor-pointer text-forest">Cómo tratamos los datos existentes</summary><p className="mt-3">Las celdas vacías conservan los contactos, grupo y cupo al actualizar. En un alta, el cupo vacío significa una persona. El cupo total incluye al destinatario. También aceptamos planillas anteriores con Acompañantes permitidos: se convierten sumando uno. Para borrar contactos, usá Editar invitado. Sin correo, teléfono ni documento se crea una invitación nueva: un lote nuevo volverá a crearla. No se concilia por nombre.</p><p className="mt-2">Las filas válidas se guardan juntas en una transacción. Las filas rechazadas no se modifican. Si ocurre una falla inesperada, se revierte el lote completo.</p></details>
    {busy ? <p role="status" className="my-6 text-sm text-forest">{preview.isPending ? 'Analizando y conciliando el archivo…' : 'Guardando el lote…'}</p> : null}
    {error ? <p role="alert" className="my-5 text-sm text-clay">{typeof error === 'object' && 'code' in error ? guestError(error) : excelError(error)}</p> : null}
    {report && preview.data ? <>
      <div role="status" className="mb-6 border-y border-line py-6"><p className="eyebrow">{commit.isSuccess ? 'IMPORTACIÓN COMPLETADA' : 'VISTA PREVIA · TODAVÍA SIN GUARDAR'}</p><p className="mt-2 break-all text-sm text-muted">{preview.data.filename}</p><div className="mt-5 grid grid-cols-3 gap-3"><div><p className="font-display text-4xl text-forest">{report.created}</p><p className="mt-1 text-xs text-muted">{commit.isSuccess ? 'creados' : 'por crear'}</p></div><div><p className="font-display text-4xl text-forest">{report.updated}</p><p className="mt-1 text-xs text-muted">{commit.isSuccess ? 'actualizados' : 'por actualizar'}</p></div><div><p className="font-display text-4xl text-clay">{report.rejected}</p><p className="mt-1 text-xs text-muted">rechazados</p></div></div></div>
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-display text-2xl text-forest">Revisión por fila</h2>{commit.isSuccess ? <Link to={`/eventos/${eventId}/invitados`} className="button-primary">Ver invitados</Link> : <button type="button" className="button-primary" disabled={busy || report.created + report.updated === 0} onClick={() => commit.mutate()}>Importar {report.created + report.updated} filas válidas</button>}</div>
      {!commit.isSuccess ? <p className="my-4 text-xs leading-5 text-muted">Se vuelve a comprobar la conciliación al guardar. Si otra persona modifica la lista, el resultado puede cambiar. Corregí las filas rechazadas en el archivo y cargalas en un lote nuevo.</p> : <p className="my-4 text-sm text-forest">La lista ya está actualizada. Podés cargar otro archivo para continuar.</p>}
      <ol className="mt-5 divide-y divide-line rounded-xl border border-line bg-paper">{rows.slice(page * 25, (page + 1) * 25).map(row => {
        const status = statuses.get(row.rowNumber), errors = row.errors.length ? row.errors : status?.status === 'rejected' ? [importReason(status.reason)] : []
        return <li key={row.rowNumber} className="p-5"><div className="mb-3 flex flex-wrap justify-between gap-2"><span className="text-xs text-muted">Fila {row.rowNumber}</span><span className={`text-xs font-medium ${errors.length ? 'text-clay' : 'text-forest'}`}>{errors.length ? 'Rechazada' : status?.status === 'updated' ? commit.isSuccess ? 'Actualizado' : 'Se actualizará' : commit.isSuccess ? 'Creado' : 'Se creará'}</span></div><dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">{headers.map((header, index) => <div className="min-w-0" key={header}><dt className="text-xs text-muted">{header}</dt><dd className="mt-1 break-all text-sm">{row.cells[index] || '—'}</dd></div>)}</dl>{errors.length ? <ul className="mt-3 space-y-1 text-xs leading-5 text-clay">{errors.map(message => <li key={message}>{message}</li>)}</ul> : null}</li>
      })}</ol>
      <Pagination page={page} total={rows.length} busy={busy} onChange={setPage} />
    </> : null}
  </section>
}
