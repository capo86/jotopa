import { z } from 'zod'
import { requireSupabase } from '../../lib/supabase'
import type { EventRole } from '../../lib/permissions'

export const inviteSchema = z.object({ email: z.email('Ingresá un correo válido.').trim().toLowerCase(), role: z.enum(['owner','manager','invitations','content','moderator','checkin','viewer']) })
const deliverySchema = z.object({ inviteId: z.uuid(), delivery: z.enum(['sent','manual']), link: z.url().optional() })

export async function fetchTeam(eventId: string, signal: AbortSignal) {
  const sdk = requireSupabase()
  const [team, invites, audit] = await Promise.all([
    sdk.rpc('list_event_team', { p_event_id: eventId }).abortSignal(signal),
    sdk.from('event_member_invites').select('id,event_id,email,role,expires_at,accepted_at,revoked_at,created_at').eq('event_id', eventId).order('created_at', { ascending: false }).limit(100).abortSignal(signal),
    sdk.from('audit_log').select('id,action,actor_id,target,meta,created_at').eq('event_id', eventId).order('created_at', { ascending: false }).limit(30).abortSignal(signal),
  ])
  if (team.error) throw team.error
  if (invites.error) throw invites.error
  if (audit.error) throw audit.error
  return { team: team.data, invites: invites.data, audit: audit.data, checkedAt: Date.now() }
}
export async function changeMemberRole(eventId: string, userId: string, role: EventRole) {
  const { error } = await requireSupabase().rpc('change_event_member_role', { p_event_id: eventId, p_user_id: userId, p_role: role })
  if (error) throw error
}
export async function removeMember(eventId: string, userId: string) {
  const { error } = await requireSupabase().rpc('remove_event_member', { p_event_id: eventId, p_user_id: userId })
  if (error) throw error
}
export async function sendInvite(eventId: string, values: unknown) {
  const data = inviteSchema.parse(values)
  const { data: result, error } = await requireSupabase().functions.invoke('invite-member', { body: { eventId, ...data } })
  if (error) {
    if (error.context instanceof Response) {
      const body: unknown = await error.context.json().catch(() => null)
      const parsed = z.object({ error: z.enum(['forbidden','already_member','invite_rate_limit','invalid_request','unauthorized']) }).safeParse(body)
      if (parsed.success) throw Object.assign(new Error(parsed.data.error), { code: parsed.data.error === 'forbidden' || parsed.data.error === 'unauthorized' ? '42501' : 'P0001' })
    }
    throw new Error('delivery_unavailable')
  }
  return deliverySchema.parse(result)
}
export async function revokeInvite(id: string) {
  const { error } = await requireSupabase().rpc('revoke_event_member_invite', { p_invite_id: id })
  if (error) throw error
}
export async function previewInvite(token: string, signal: AbortSignal) {
  const { data, error } = await requireSupabase().rpc('preview_event_member_invite', { p_token: token }).abortSignal(signal).single()
  if (error) throw error
  return data
}
export async function acceptInvite(token: string) {
  const { data, error } = await requireSupabase().rpc('accept_event_member_invite', { p_token: token })
  if (error) throw error
  return data
}
