import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { deleteGuest, exportGuests, listGuests } from '../api'
import { guestError, RSVP_LABELS } from '../models'
import type { Guest, GuestFilters } from '../models'
import { downloadWorkbook, excelError, excelTask } from '../excel-client'
import { GuestDialog } from './GuestDialog'
import { Pagination } from './Pagination'
import { GuestLinkDialog } from './GuestLinkDialog'
import {useGuestInvitationTracking,GuestInvitationHistory,DeliveryStatus} from '../../invitations'

export function GuestsWorkspace({ eventId, title, fullAccess, timezone }: { eventId: string; title: string; fullAccess: boolean; timezone:string }) {
  const [filters, setFilters] = useState<GuestFilters>({ search: '', group: '', contact: 'all', page: 0 })
  const [editor, setEditor] = useState<{ guest: Guest | null } | null>(null)
  const [notice, setNotice] = useState('')
  const [linkGuest,setLinkGuest]=useState<Guest|null>(null)
  const [historyGuest,setHistoryGuest]=useState<Guest|null>(null)
  const cache = useQueryClient()
  const query = useQuery({ queryKey: ['guests', eventId, filters], queryFn: ({ signal }) => listGuests(eventId, filters, signal), retry: false })
  const tracking=useGuestInvitationTracking(eventId,query.data?.rows.map(guest=>guest.id) ?? [],fullAccess)
  const trackingByGuest=new Map(tracking.data?.map(item=>[item.guest_id,item]))
  const groups = [...new Set([...(query.data?.groups ?? []), ...(filters.group ? [filters.group] : [])])]
  const deletion = useMutation({ mutationFn: (id: string) => deleteGuest(eventId, id), onSuccess: async () => { setNotice('Invitado eliminado.'); setFilters(current => ({ ...current, page: 0 })); await cache.invalidateQueries({ queryKey: ['guests', eventId] }) } })
  const excel = useMutation({ mutationFn: async (kind: 'template' | 'export') => {
    const guests = kind === 'export' ? await exportGuests(eventId, filters) : []
    const result = await excelTask(kind === 'template' ? { kind } : { kind, guests })
    if (!result.buffer) throw new Error('invalid_workbook')
    downloadWorkbook(result.buffer, kind === 'template' ? 'jotopa-plantilla-invitados.xlsx' : 'jotopa-invitados.xlsx')
  } })
  return <section className="max-w-6xl">
    <Link to={`/eventos/${eventId}`} className="text-sm text-forest underline underline-offset-4">Volver al evento</Link>
    <header className="mt-8 flex flex-wrap items-end justify-between gap-6 border-b border-line pb-7"><div className="min-w-0"><p className="eyebrow break-words">{title}</p><h1 className="mt-3 font-display text-5xl tracking-tight text-forest">Invitados<span className="text-clay">.</span></h1><p className="mt-3 max-w-lg text-sm leading-6 text-muted">{fullAccess ? 'Una lista ordenada para reunir a las personas que importan.' : 'Acceso de recepción: solo nombres y mesa. Las asignaciones se actualizan desde Mesas.'}</p></div>{fullAccess ? <button type="button" className="button-primary" onClick={() => { setNotice(''); setEditor({ guest: null }) }}>Agregar invitado <span aria-hidden="true">+</span></button> : null}</header>
    <div className="mt-4 flex flex-wrap gap-6"><button type="button" className="min-h-11 text-sm text-forest underline underline-offset-4" disabled={query.isFetching} onClick={()=>{void Promise.all([query.refetch(),...(fullAccess? [tracking.refetch()]:[])])}}>Actualizar lista</button>{fullAccess?<Link to={`/eventos/${eventId}/invitaciones`} className="flex min-h-11 items-center text-sm text-forest underline underline-offset-4">Enviar invitaciones</Link>:null}</div>
    {fullAccess ? <div className="my-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-forest"><Link to={`/eventos/${eventId}/invitados/importar`} className="min-h-11 py-3 underline underline-offset-4">Importar desde Excel</Link><button type="button" className="min-h-11 py-3 underline underline-offset-4" disabled={excel.isPending} onClick={() => excel.mutate('template')}>Descargar plantilla</button><button type="button" className="min-h-11 py-3 underline underline-offset-4" disabled={excel.isPending || !query.data?.total} onClick={() => excel.mutate('export')}>{excel.isPending ? 'Preparando archivo…' : 'Exportar lista filtrada'}</button></div> : null}
    <form className="my-6 grid gap-3 rounded-xl border border-line bg-paper p-4 sm:grid-cols-2 lg:flex lg:items-end" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget)
      const contact = form.get('contact'); setFilters({ search: String(form.get('search') ?? '').trim(), group: String(form.get('group') ?? ''), contact: contact === 'with_contact' || contact === 'without_contact' ? contact : 'all', page: 0 })
    }}>
      <label className="min-w-0 flex-1 text-xs text-muted">Buscar<input name="search" maxLength={160} type="search" className="form-input mt-2" placeholder={fullAccess ? 'Nombre, contacto o documento' : 'Nombre del invitado'} /></label>
      {fullAccess ? <><label className="min-w-0 text-xs text-muted">Grupo<select name="group" className="form-input mt-2"><option value="">Todos los grupos</option>{groups.map(group => <option key={group}>{group}</option>)}</select></label><label className="min-w-0 text-xs text-muted">Datos de contacto<select name="contact" className="form-input mt-2"><option value="all">Todos</option><option value="with_contact">Con teléfono o correo</option><option value="without_contact">Sin teléfono ni correo</option></select></label></> : null}
      <button className="button-primary" type="submit">Buscar y filtrar</button>
    </form>
    {notice ? <p role="status" className="mb-4 text-sm text-forest">{notice}</p> : null}
    {excel.isError ? <p role="alert" className="mb-4 text-sm text-clay">{typeof excel.error === 'object' && 'code' in excel.error ? guestError(excel.error) : excelError(excel.error)}</p> : null}
    {deletion.isError ? <p role="alert" className="mb-4 text-sm text-clay">{guestError(deletion.error)}</p> : null}
    {fullAccess && tracking.isError?<p role="alert" className="mb-4 text-sm text-clay">No pudimos actualizar el seguimiento. Usá Actualizar lista para volver a intentar.</p>:null}
    {query.isFetching ? <p role="status" className="py-8 text-muted">Cargando invitados…</p> : null}
    {query.isError ? <div role="alert" className="rounded-xl border border-line p-6"><p>{guestError(query.error)}</p><button type="button" className="mt-3 underline" onClick={() => { void query.refetch() }}>Volver a intentar</button></div> : null}
    {query.data && !query.isFetching ? <>
      {!query.data.total ? <div className="rounded-xl border border-dashed border-sand px-5 py-12 text-center"><p className="font-display text-2xl text-forest">{filters.search || filters.group || filters.contact !== 'all' ? 'No hay coincidencias' : 'Tu lista está por comenzar'}</p><p className="mt-3 text-sm text-muted">{fullAccess ? 'Agregá una persona o importá tu lista desde Excel.' : 'Todavía no hay invitados para mostrar.'}</p></div> : <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
        {query.data.rows.map(guest => <li key={guest.id} className="grid min-w-0 gap-4 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0"><h2 className="break-words font-medium text-forest">{guest.full_name}</h2>{'group_label' in guest ? <p className="mt-1 break-words text-xs text-muted">{guest.group_label || 'Sin grupo'}</p> : <p className="mt-1 text-xs text-muted">Mesa: {guest.table_name || 'sin asignar'}</p>}</div>
          {'email' in guest ? <><div className="min-w-0 space-y-1 break-all text-sm"><p>{guest.phone || 'Sin teléfono'}</p><p className="text-muted">{guest.email || 'Sin correo'}</p></div><div className="min-w-0 space-y-1 text-xs leading-5 text-muted"><p>Cupo: {guest.party_size} {guest.party_size===1?'persona':'personas'}</p><p>Mesa: {guest.table_name || 'sin asignar'}</p><p className="break-all">Documento: {guest.document_id || 'sin registrar'}</p><DeliveryStatus tracking={trackingByGuest.get(guest.id)} unavailable={tracking.isError} /><p className="font-medium text-forest">RSVP: {RSVP_LABELS[guest.rsvp_status]}{guest.rsvp_status==='yes' ? ` · ${guest.attending_count} personas confirmadas` : ''}</p>{guest.rsvp_at ? <p>Respuesta: {new Intl.DateTimeFormat('es-PY',{dateStyle:'short',timeStyle:'short',timeZone:timezone}).format(new Date(guest.rsvp_at))}</p> : null}{guest.opted_out ? <p className="text-clay">No quiere más recordatorios</p> : null}<p>Consentimiento: {guest.contact_consent ? 'sí' : 'no'}</p></div><div className="flex max-w-56 flex-wrap items-start gap-x-4 gap-y-1 text-sm"><button type="button" className="min-h-11 underline underline-offset-4" onClick={()=>setLinkGuest(guest)} aria-label={`Enlace y QR de ${guest.full_name}`}>Enlace y QR</button><button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setEditor({ guest })} aria-label={`Editar a ${guest.full_name}`}>Editar</button><button type="button" className="min-h-11 underline underline-offset-4" onClick={()=>setHistoryGuest(guest)} aria-label={`Historial de ${guest.full_name}`}>Historial</button><details><summary className="flex min-h-11 cursor-pointer items-center text-clay">Eliminar</summary><p className="max-w-40 text-xs leading-5">¿Eliminar a esta persona de la lista?</p><button type="button" className="mt-2 min-h-11 text-clay underline" disabled={deletion.isPending} onClick={() => deletion.mutate(guest.id)}>Confirmar baja</button></details></div></> : null}
        </li>)}
      </ul>}
      <Pagination page={filters.page} total={query.data.total} onChange={page => setFilters(current => ({ ...current, page }))} />
    </> : null}
    {historyGuest ? <GuestInvitationHistory eventId={eventId} guestId={historyGuest.id} name={historyGuest.full_name} timezone={timezone} onClose={()=>setHistoryGuest(null)} /> : null}
    {linkGuest ? <GuestLinkDialog eventId={eventId} guestId={linkGuest.id} name={linkGuest.full_name} onClose={()=>setLinkGuest(null)} /> : null}
    {editor ? <GuestDialog eventId={eventId} guest={editor.guest} onClose={() => { setEditor(null) }} /> : null}
  </section>
}
