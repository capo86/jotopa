type SharePreview = { title: string; starts_at: string; timezone: string }

function escapeMeta(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

async function getPreview(token: string): Promise<SharePreview | null> {
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !key || !/^[a-f0-9]{64}$/.test(token)) return null
  try {
    const response = await fetch(new URL('/rest/v1/rpc/invitation_share_preview', base), {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) return null
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    return typeof record.title === 'string' && typeof record.starts_at === 'string' && typeof record.timezone === 'string'
      ? { title: record.title, starts_at: record.starts_at, timezone: record.timezone }
      : null
  } catch {
    return null
  }
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
    const url = new URL(request.url)
    const token = url.searchParams.get('token') ?? ''
    const pageHeaders = new Headers()
    for (const name of ['cookie', 'x-vercel-protection-bypass']) {
      const value = request.headers.get(name)
      if (value) pageHeaders.set(name, value)
    }
    const [page, preview] = await Promise.all([
      fetch(new URL('/index.html', url.origin), { headers: pageHeaders, signal: AbortSignal.timeout(5000) }),
      getPreview(token),
    ])
    if (!page.ok) return new Response('No pudimos abrir la invitación.', { status: 503 })
    const eventTitle = preview?.title.trim().slice(0, 160)
    const title = eventTitle ? eventTitle + ' · Jotopa.encuentros' : 'Jotopa.encuentros'
    let date = ''
    if (preview) {
      try {
        date = new Intl.DateTimeFormat('es-PY', { dateStyle: 'long', timeZone: preview.timezone }).format(new Date(preview.starts_at))
      } catch { /* Keep a safe generic description. */ }
    }
    const description = eventTitle
      ? 'Te invitamos a ' + eventTitle + (date ? ' el ' + date : '') + '. Abrí tu invitación y confirmá tu asistencia.'
      : 'Un encuentro para recordar. Abrí tu invitación personal y confirmá tu asistencia.'
    const tags = [
      '<meta property="og:type" content="website" />',
      '<meta property="og:site_name" content="Jotopa.encuentros" />',
      '<meta property="og:title" content="' + escapeMeta(title) + '" />',
      '<meta property="og:description" content="' + escapeMeta(description) + '" />',
      '<meta name="twitter:card" content="summary" />',
      '<meta name="twitter:title" content="' + escapeMeta(title) + '" />',
      '<meta name="twitter:description" content="' + escapeMeta(description) + '" />',
    ].join('\n    ')
    const source = await page.text()
    if (!source.includes('<div id="root"></div>')) return new Response('No pudimos abrir la invitación.', { status: 503 })
    const html = source
      .replace(/<title>[^<]*<\/title>/, '<title>' + escapeMeta(title) + '</title>')
      .replace(/<meta name="description" content="[^"]*" \/>/, '<meta name="description" content="' + escapeMeta(description) + '" />')
      .replace('</head>', '    ' + tags + '\n  </head>')
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    })
  },
}