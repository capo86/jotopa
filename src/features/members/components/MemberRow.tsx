import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { changeMemberRole, removeMember } from '../api'
import { canManageRole, EVENT_ROLES, ROLE_LABELS, type EventRole } from '../../../lib/permissions'
import { eventErrorMessage } from '../../../lib/event-errors'

type Member = { user_id: string; full_name: string; role: EventRole }
export function MemberRow({ member, actorRole, ownId, eventId, ownerCount }: { member: Member; actorRole: EventRole; ownId: string; eventId: string; ownerCount: number }) {
  const [nextRole, setNextRole] = useState<EventRole>(member.role)
  const queryClient = useQueryClient()
  const canEdit = ownId !== member.user_id && canManageRole(actorRole, member.role)
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['team', eventId] }), queryClient.invalidateQueries({ queryKey: ['event', eventId] })]) }
  const change = useMutation({ mutationFn: () => changeMemberRole(eventId, member.user_id, nextRole), onSuccess: refresh })
  const remove = useMutation({ mutationFn: () => removeMember(eventId, member.user_id), onSuccess: refresh })
  const pending = change.isPending || remove.isPending
  return <li className="border-b border-line py-5 last:border-b-0"><div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className="break-words font-medium text-forest">{member.full_name || 'Colaborador'}{ownId === member.user_id ? ' (vos)' : ''}</p><p className="mt-1 text-xs text-muted">{ROLE_LABELS[member.role]}</p></div>{canEdit ? <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto"><select aria-label={`Rol de ${member.full_name || 'colaborador'}`} value={nextRole} className="form-input w-auto max-w-full" disabled={pending} onChange={e => { const role = EVENT_ROLES.find(role => role === e.target.value); if (role) setNextRole(role) }}>{EVENT_ROLES.filter(role => canManageRole(actorRole, role)).map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select><button type="button" disabled={pending || nextRole === member.role || (member.role === 'owner' && ownerCount <= 1)} className="text-sm text-forest underline disabled:opacity-40" onClick={() => change.mutate()}>Guardar rol</button><details className="text-sm text-clay"><summary className="cursor-pointer">Quitar del equipo</summary><p className="mt-3 max-w-xs text-xs leading-5">Esta persona perderá su acceso al evento.</p><button type="button" className="mt-3 underline disabled:opacity-40" disabled={pending || (member.role === 'owner' && ownerCount <= 1)} onClick={() => remove.mutate()}>Confirmar quitar</button></details></div> : null}</div>{change.isError || remove.isError ? <p role="alert" className="mt-3 text-sm text-clay">{eventErrorMessage(change.error ?? remove.error)}</p> : null}</li>
}
