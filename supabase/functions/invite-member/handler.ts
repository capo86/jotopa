export type InvitationRequest = { eventId: string; email: string; role: string }
export type IssuedInvitation = { id: string; token: string; eventTitle: string }
export type InvitationServices = {
  appUrl: string
  authorize: (authorization: string) => Promise<boolean>
  issue: (request: InvitationRequest, authorization: string) => Promise<IssuedInvitation>
  send: (email: string, title: string, link: string) => Promise<boolean>
}
const roles = ['owner','manager','invitations','content','moderator','checkin','viewer']
export class InvitationError extends Error {
  readonly status: number
  constructor(status: number, code: string) { super(code); this.status = status }
}

async function smallJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new InvitationError(400, 'invalid_request')
  let size = 0
  let content = ''
  const decoder = new TextDecoder()
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > 4096) { await reader.cancel(); throw new InvitationError(413, 'invalid_request') }
    content += decoder.decode(chunk.value, { stream: true })
  }
  try { return JSON.parse(content + decoder.decode()) } catch { throw new InvitationError(400, 'invalid_request') }
}

export function createInvitationHandler(services: InvitationServices) {
  return async (request: Request): Promise<Response> => {
    const appOrigin = new URL(services.appUrl).origin
    const allowedOrigins = new Set([appOrigin])
    if (appOrigin === 'http://localhost:5174') allowedOrigins.add('http://127.0.0.1:5174')
    const origin = request.headers.get('Origin')
    const headers = { 'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : appOrigin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' }
    const respond = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers })
    if (origin && !allowedOrigins.has(origin)) return respond(403, { error: 'forbidden' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' })
    try {
      const authorization = request.headers.get('Authorization') ?? ''
      if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization) || !await services.authorize(authorization)) return respond(401, { error: 'unauthorized' })
      const body = await smallJson(request)
      if (!body || typeof body !== 'object' || !('eventId' in body) || !('email' in body) || !('role' in body)
        || typeof body.eventId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.eventId)
        || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
        || typeof body.role !== 'string' || !roles.includes(body.role)) return respond(400, { error: 'invalid_request' })
      const email = body.email.trim().toLowerCase()
      const issued = await services.issue({ eventId: body.eventId, email, role: body.role }, authorization)
      if (!/^[a-f0-9]{64}$/.test(issued.token)) throw new InvitationError(500, 'unavailable')
      const link = new URL('/equipo/aceptar', services.appUrl)
      link.hash = new URLSearchParams({ token: issued.token }).toString()
      let delivered = false
      try { delivered = await services.send(email, issued.eventTitle, link.href) } catch { /* A free manual fallback remains available. */ }
      return respond(200, { inviteId: issued.id, delivery: delivered ? 'sent' : 'manual', ...(delivered ? {} : { link: link.href }) })
    } catch (error) {
      if (error instanceof InvitationError) return respond(error.status, { error: error.message })
      return respond(503, { error: 'unavailable' })
    }
  }
}
