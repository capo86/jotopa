import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import { createInvitationHandler, InvitationError } from './handler.ts'
import type { Database } from '../../../src/lib/database.types.ts'

const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5174'
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const publicKeys: Record<string, string> = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
const publicKey = publicKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY')!
const sdk = (authorization: string) => createClient<Database>(supabaseUrl, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: authorization }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
})
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => entities[char] ?? char)

Deno.serve(createInvitationHandler({
  appUrl,
  authorize: async (authorization) => {
    const { data, error } = await sdk(authorization).auth.getUser(authorization.slice(7))
    return !error && Boolean(data.user)
  },
  issue: async ({ eventId, email, role }, authorization) => {
    const client = sdk(authorization)
    const { data, error } = await client.rpc('create_event_member_invite', { p_event_id: eventId, p_email: email, p_role: role as Database['public']['Enums']['event_role'] })
    if (error) {
      const code = error.code === '42501' ? 'forbidden' : error.message === 'already_member' ? 'already_member' : error.message === 'invite_rate_limit' ? 'invite_rate_limit' : 'invalid_request'
      throw new InvitationError(code === 'forbidden' ? 403 : code === 'invite_rate_limit' ? 429 : 400, code)
    }
    const { data: event, error: eventError } = await client.from('events').select('title').eq('id', eventId).single()
    if (eventError || !data?.[0]) throw new InvitationError(403, 'forbidden')
    return { id: data[0].invite_id, token: data[0].token, eventTitle: event.title }
  },
  send: async (email, title, link) => {
    const subject = `Te invitaron al equipo de ${title.replace(/[\r\n]/g, ' ')}`
    const text = `Te invitaron a colaborar en ${title}. La invitación vence en 7 días. Iniciá sesión con este correo y aceptá desde: ${link}\nSi no esperabas esta invitación, podés ignorarla.`
    const html = `<p>Te invitaron a colaborar en <strong>${escapeHtml(title)}</strong>.</p><p>La invitación vence en 7 días. Iniciá sesión con este correo y aceptá el rol que te asignaron.</p><p><a href="${escapeHtml(link)}">Ver invitación al equipo</a></p><p>Si no esperabas esta invitación, podés ignorarla.</p>`
    const transport = Deno.env.get('TEAM_MAIL_TRANSPORT') ?? 'disabled'
    if (transport === 'mailpit') {
      const baseUrl = Deno.env.get('TEAM_MAILPIT_URL')
      if (!baseUrl || !['localhost','127.0.0.1','supabase_inbucket_jotopa','host.docker.internal'].includes(new URL(baseUrl).hostname)) return false
      const response = await fetch(new URL('/api/v1/send', baseUrl), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ From: { Email: 'no-reply@jotopa.local', Name: 'Jotopa' }, To: [{ Email: email }], Subject: subject, Text: text, HTML: html }),
      })
      return response.ok
    }
    if (transport === 'resend') {
      const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('TEAM_MAIL_FROM')
      if (!key || !from) return false
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ from, to: [email], subject, text, html }),
      })
      // No paid upgrade or retry loop: exhausted quota falls back to a manual link.
      return response.ok
    }
    return false
  },
}))
