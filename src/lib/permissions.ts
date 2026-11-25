import type { Enums } from './database.types'

export type EventRole = Enums<'event_role'>
export const EVENT_ROLES = ['owner','manager','invitations','content','moderator','checkin','viewer'] as const satisfies readonly EventRole[]
export const ROLE_LABELS: Record<EventRole, string> = {
  owner: 'Propietario', manager: 'Administrador', invitations: 'Invitaciones', content: 'Contenido', moderator: 'Moderación', checkin: 'Recepción', viewer: 'Solo lectura',
}
// Mirror only for UI visibility. SQL event_role_permissions + RLS are authoritative.
export const ROLE_PERMISSIONS = {
  owner: ['tables.read','tables.write','tables.assign','tables.publish','event.read','event.update','event.delete','event.transfer','members.manage','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read','content.write','wall.moderate','checkin.write','audit.read'],
  manager: ['tables.read','tables.write','tables.assign','tables.publish','event.read','event.update','members.manage','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read','content.write','wall.moderate','checkin.write','audit.read'],
  invitations: ['tables.read','tables.assign','event.read','guests.read','guests.write','guests.contact_read','invitations.send','reminders.manage','dashboard.read'],
  content: ['tables.read','tables.write','tables.assign','event.read','content.write'], moderator: ['event.read','wall.moderate'], checkin: ['tables.read','event.read','checkin.write'], viewer: ['event.read','dashboard.read'],
} as const satisfies Record<EventRole, readonly string[]>
export type EventPermission = typeof ROLE_PERMISSIONS[EventRole][number]

export function hasPermission(role: EventRole | null | undefined, permission: EventPermission): boolean {
  return Boolean(role && (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission))
}
export function canManageRole(actor: EventRole | null | undefined, target: EventRole): boolean {
  return actor === 'owner' || (actor === 'manager' && target !== 'owner')
}
