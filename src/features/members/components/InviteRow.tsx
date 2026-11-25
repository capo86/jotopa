import { useMutation, useQueryClient } from '@tanstack/react-query'
import { revokeInvite } from '../api'
import { canManageRole, ROLE_LABELS, type EventRole } from '../../../lib/permissions'
import { eventErrorMessage } from '../../../lib/event-errors'

type Invite = { id: string; email: string; role: EventRole; expires_at: string; accepted_at: string | null; revoked_at: string | null }
export function InviteRow({ invite, eventId, actorRole, checkedAt }: { invite: Invite; eventId: string; actorRole: EventRole; checkedAt: number }) {
  const queryClient = useQueryClient()
  const revoke = useMutation({ mutationFn: () => revokeInvite(invite.id), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['team', eventId] }) } })
  const status = invite.accepted_at ? 'Aceptada' : invite.revoked_at ? 'Revocada' : Date.parse(invite.expires_at) <= checkedAt ? 'Vencida' : 'Pendiente'
  return <li className="border-b border-line py-4 last:border-0"><div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className="break-all text-sm text-forest">{invite.email}</p><p className="mt-2 text-xs text-muted">{ROLE_LABELS[invite.role]} · {status}</p></div>{status === 'Pendiente' && canManageRole(actorRole, invite.role) ? <button type="button" className="text-xs text-clay underline disabled:opacity-40" disabled={revoke.isPending} onClick={() => revoke.mutate()}>Revocar invitación</button> : null}</div>{revoke.isError ? <p role="alert" className="mt-3 text-sm text-clay">{eventErrorMessage(revoke.error)}</p> : null}</li>
}
