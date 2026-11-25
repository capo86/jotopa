import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')
export const apiUrl = process.env.VITE_SUPABASE_URL
export const publicKey = process.env.VITE_SUPABASE_ANON_KEY
if (apiUrl !== 'http://127.0.0.1:54321' || !publicKey?.startsWith('sb_publishable_') || !readFileSync('supabase/config.toml', 'utf8').includes('project_id = "jotopa"')) {
  throw new Error('Estas pruebas solo pueden ejecutarse contra Supabase Local de jotopa.')
}

export function client() {
  return createClient(apiUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

export function sql(statement) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_jotopa', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t'], {
    input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function removeTestUsers(userIds) {
  if (!userIds.length) return
  if (!userIds.every(id => /^[0-9a-f-]{36}$/.test(id))) throw new Error('Identificador de prueba inválido.')
  sql(`delete from auth.users where id in (${userIds.map(id => `'${id}'::uuid`).join(',')});`)
}

export async function removeTestMessage(messageId) {
  if (typeof messageId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(messageId)) throw new Error('Identificador de correo de prueba inválido.')
  const response = await fetch('http://127.0.0.1:54324/api/v1/messages', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [messageId] }),
  })
  if (!response.ok) throw new Error('No se pudo retirar el correo de prueba de Mailpit.')
}
