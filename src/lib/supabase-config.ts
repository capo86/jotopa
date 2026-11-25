import { z } from 'zod'

export const httpUrl = z.url().refine((value) => {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (url.protocol === 'https:' || url.protocol === 'http:')
    && !url.username && !url.password && !url.search && !url.hash
})

function isPublicKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true

  // This only checks the legacy key's role, not its signature or validity.
  // The API must still accept the key before the connection is verified.
  const parts = value.split('.')
  if (parts.length !== 3 || !parts[1]) return false
  try {
    const payload: unknown = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return z.object({ role: z.literal('anon') }).safeParse(payload).success
  } catch {
    return false
  }
}

const configSchema = z.object({
  url: httpUrl,
  publicKey: z.string().trim().refine(isPublicKey),
})

export type SupabaseConfig = z.infer<typeof configSchema>
export type SupabaseConfiguration =
  | { status: 'missing' | 'invalid'; config: null }
  | { status: 'configured'; config: SupabaseConfig }

export function parseSupabaseConfiguration(url: unknown, publicKey: unknown): SupabaseConfiguration {
  if (typeof url !== 'string' || !url.trim() || typeof publicKey !== 'string' || !publicKey.trim()) {
    return { status: 'missing', config: null }
  }
  const result = configSchema.safeParse({ url, publicKey })
  return result.success
    ? { status: 'configured', config: result.data }
    : { status: 'invalid', config: null }
}

