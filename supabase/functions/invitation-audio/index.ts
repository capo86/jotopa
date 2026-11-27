import { createClient } from 'npm:@supabase/supabase-js@2.119.2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const keys: Record<string, string> = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
const publicKey = keys.default ?? Deno.env.get('SUPABASE_ANON_KEY')!
const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const appOrigin = new URL(Deno.env.get('APP_URL') ?? 'http://localhost:5174').origin
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const client = (key: string, authorization?: string) =>
  createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(authorization ? { headers: { Authorization: authorization } } : {}),
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
    },
  })
const pathFor = (eventId: string, assetId: string, mime: string) =>
  eventId + '/' + assetId + (mime === 'audio/mpeg' ? '.mp3' : '.m4a')

Deno.serve(async request => {
  const origin = request.headers.get('origin') ?? ''
  const allowed = origin === '' || origin === appOrigin ||
    (appOrigin === 'http://localhost:5174' && ['http://localhost:5176', 'http://127.0.0.1:5174'].includes(origin))
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'Vary': 'Origin',
    ...(origin && allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (!allowed) return reply({ error: 'origin_not_allowed' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply({ error: 'invalid_request' }, 405)
  try {
    const maximum = 8_500_000
    if (Number(request.headers.get('content-length') ?? 0) > maximum) return reply({ error: 'invalid_audio' }, 413)
    const reader = request.body?.getReader()
    if (!reader) return reply({ error: 'invalid_request' }, 400)
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.length
      if (total > maximum) { await reader.cancel(); return reply({ error: 'invalid_audio' }, 413) }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.startsWith('application/json')) {
      if (total > 1024) return reply({ error: 'invalid_request' }, 400)
      const body: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (!record(body) || body.action !== 'sign' || !uuid(body.asset_id)) return reply({ error: 'invalid_request' }, 400)
      const assetId = body.asset_id
      let path = ''
      let closing = Date.now() + 600_000
      if (uuid(body.event_id) && Object.keys(body).sort().join(',') === 'action,asset_id,event_id') {
        const user = client(publicKey, request.headers.get('authorization') ?? '')
        const auth = await user.auth.getUser()
        if (auth.error || !auth.data.user) return reply({ error: 'unauthorized' }, 401)
        const { data, error } = await user.from('invitation_audio_assets')
          .select('event_id,mime_type').eq('id', assetId).eq('event_id', body.event_id).eq('status', 'ready').maybeSingle()
        if (error || !data) return reply({ error: 'audio_unavailable' }, 403)
        path = pathFor(data.event_id, assetId, data.mime_type)
      } else if (
        typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token) &&
        Object.keys(body).sort().join(',') === 'action,asset_id,token'
      ) {
        const { data, error } = await client(publicKey).rpc('invitation_audio_access', { p_asset_id: assetId, p_token: body.token })
        if (error || !record(data) || typeof data.path !== 'string' || typeof data.closes_at !== 'string')
          return reply({ error: 'audio_unavailable' }, 403)
        path = data.path
        closing = Date.parse(data.closes_at)
      } else if (
        typeof body.slug === 'string' && /^[a-z0-9-]{1,100}$/.test(body.slug) &&
        Object.keys(body).sort().join(',') === 'action,asset_id,slug'
      ) {
        const { data, error } = await client(publicKey).rpc('invitation_audio_access', { p_asset_id: assetId, p_slug: body.slug })
        if (error || !record(data) || typeof data.path !== 'string' || typeof data.closes_at !== 'string')
          return reply({ error: 'audio_unavailable' }, 403)
        path = data.path
        closing = Date.parse(data.closes_at)
      } else return reply({ error: 'invalid_request' }, 400)
      if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp3|m4a)$/.test(path))
        return reply({ error: 'audio_unavailable' }, 403)
      const seconds = Math.min(600, Math.floor((closing - Date.now()) / 1000) - 2)
      if (seconds < 1) return reply({ error: 'audio_unavailable' }, 403)
      const signed = await client(serverKey).storage.from('invitation-audio').createSignedUrl(path, seconds)
      if (signed.error || !signed.data.signedUrl) return reply({ error: 'audio_unavailable' }, 503)
      return reply({ url: new URL(signed.data.signedUrl, supabaseUrl).href })
    }
    if (!contentType.startsWith('multipart/form-data')) return reply({ error: 'invalid_request' }, 400)
    const user = client(publicKey, request.headers.get('authorization') ?? '')
    const auth = await user.auth.getUser()
    if (auth.error || !auth.data.user) return reply({ error: 'unauthorized' }, 401)
    const form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData()
    if ([...form.keys()].sort().join(',') !== 'event_id,file') return reply({ error: 'invalid_request' }, 400)
    const eventId = form.get('event_id')
    const file = form.get('file')
    if (!uuid(eventId) || !(file instanceof File) || file.size < 1 || file.size > 8_388_608)
      return reply({ error: 'invalid_audio' }, 400)
    const audioBytes = new Uint8Array(await file.arrayBuffer())
    const mp3 = /\.mp3$/i.test(file.name) &&
      ((audioBytes[0] === 73 && audioBytes[1] === 68 && audioBytes[2] === 51) ||
        (audioBytes[0] === 255 && ((audioBytes[1] ?? 0) & 224) === 224))
    const m4a = /\.m4a$/i.test(file.name) &&
      String.fromCharCode(...audioBytes.subarray(4, 8)) === 'ftyp'
    const mime = mp3 ? 'audio/mpeg' : m4a ? 'audio/mp4' : ''
    if (!mime) return reply({ error: 'invalid_audio' }, 400)
    const reservation = await user.rpc('reserve_invitation_audio', {
      p_event_id: eventId, p_mime_type: mime, p_bytes: file.size,
    })
    if (reservation.error || !uuid(reservation.data))
      return reply({ error: reservation.error?.message === 'upload_limit' ? 'audio_upload_limit' : reservation.error?.message === 'asset_limit' ? 'audio_asset_limit' : 'forbidden' }, 403)
    const assetId = reservation.data
    const path = pathFor(eventId, assetId, mime)
    const service = client(serverKey)
    try {
      const stored = await service.storage.from('invitation-audio')
        .upload(path, audioBytes, { contentType: mime, upsert: false, cacheControl: '600' })
      if (stored.error) throw new Error('audio_unavailable')
      const completed = await service.rpc('complete_invitation_audio', { p_asset_id: assetId })
      if (completed.error) throw new Error('audio_unavailable')
      return reply({ ok: true, id: assetId })
    } catch {
      await service.storage.from('invitation-audio').remove([path])
      await service.from('invitation_audio_assets').delete().eq('id', assetId)
      return reply({ error: 'audio_unavailable' }, 503)
    }
  } catch {
    return reply({ error: 'audio_unavailable' }, 503)
  }
})