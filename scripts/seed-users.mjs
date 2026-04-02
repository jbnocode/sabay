#!/usr/bin/env node
/**
 * Optional: create demo driver + passenger via Supabase Auth Admin API.
 * Prefer running supabase/seed_demo_users.sql in the SQL Editor (no API key issues).
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← must be "service_role", NOT the anon key
 *
 * npm run seed:users
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')

function loadEnvLocal() {
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(b64, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function explainServiceRoleKey() {
  console.error(`
Invalid or missing service role key.

Fix:
  1. Open Supabase Dashboard → Project Settings → API
  2. Under "Project API keys", copy the secret labeled "service_role" (long JWT)
  3. Put it in sabay-carpool/.env.local as:

     SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Do NOT use:
  • NEXT_PUBLIC_SUPABASE_ANON_KEY (that is the "anon" / public key — Admin API returns 401)
  • Placeholder text like your_service_role_key

Alternatively, skip this script and run supabase/seed_demo_users.sql in the SQL Editor.
`)
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const DEMO_PASSWORD = process.env.SABAY_SEED_PASSWORD ?? 'SabayDemo2026!'

if (!url?.startsWith('http')) {
  console.error('Missing or invalid NEXT_PUBLIC_SUPABASE_URL in .env.local\n')
  explainServiceRoleKey()
  process.exit(1)
}

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  explainServiceRoleKey()
  process.exit(1)
}

if (/your_|placeholder|example/i.test(serviceKey) || serviceKey.length < 80) {
  console.error('SUPABASE_SERVICE_ROLE_KEY looks like a placeholder, not a real JWT.\n')
  explainServiceRoleKey()
  process.exit(1)
}

const payload = decodeJwtPayload(serviceKey)
if (!payload) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not a valid JWT.\n')
  explainServiceRoleKey()
  process.exit(1)
}

if (payload.role !== 'service_role') {
  console.error(
    `This JWT has role "${payload.role ?? 'unknown'}", but Admin API needs role "service_role".\n` +
      'You probably pasted NEXT_PUBLIC_SUPABASE_ANON_KEY by mistake.\n'
  )
  explainServiceRoleKey()
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserByEmail(email) {
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const u = data.users.find((x) => x.email === email)
    if (u) return u
    if (data.users.length < perPage) return null
    page += 1
  }
}

async function upsertSeedUser({ email, password, user_metadata }) {
  const existing = await findUserByEmail(email)
  if (existing) {
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata,
    })
    if (updErr) throw updErr
    const { error: profErr } = await admin
      .from('users')
      .update({
        display_name: user_metadata.display_name,
        role: user_metadata.role,
      })
      .eq('id', existing.id)
    if (profErr) throw profErr
    console.log(`Updated: ${email} (${user_metadata.role})`)
    return existing.id
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata,
  })
  if (error) throw error
  console.log(`Created: ${email} (${user_metadata.role})`)
  return data.user.id
}

async function ensureVehicle(driverId) {
  const { data: rows } = await admin.from('vehicles').select('id').eq('user_id', driverId).limit(1)
  if (rows?.length) return
  const { error } = await admin.from('vehicles').insert({
    user_id: driverId,
    type: 'sedan',
    make_model: 'Demo Sedan',
    plate_suffix: 'D01',
    seats_offered: 3,
  })
  if (error) throw error
  console.log('Inserted demo vehicle for driver')
}

async function main() {
  console.log('Seeding demo users (Auth Admin API)…\n')

  const driverId = await upsertSeedUser({
    email: 'driver@demo.sabay.app',
    password: DEMO_PASSWORD,
    user_metadata: { display_name: 'Demo Driver', role: 'driver' },
  })

  await upsertSeedUser({
    email: 'passenger@demo.sabay.app',
    password: DEMO_PASSWORD,
    user_metadata: { display_name: 'Demo Passenger', role: 'passenger' },
  })

  await ensureVehicle(driverId)

  console.log(`\nDone. Password for both: ${DEMO_PASSWORD}`)
}

main().catch((e) => {
  if (e?.message?.includes('Invalid API key') || e?.status === 401) {
    console.error('Supabase returned 401 Invalid API key.\n')
    explainServiceRoleKey()
  } else {
    console.error(e)
  }
  process.exit(1)
})
