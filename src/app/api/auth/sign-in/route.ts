import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const s = identifier.trim()
  if (!s) return null
  if (s.includes('@')) return s.toLowerCase()

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!key || key.length < 30) return null

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.rpc('resolve_login_email', { p_identifier: s })
  if (error || data == null || data === '') return null
  return String(data)
}

export async function POST(req: NextRequest) {
  let identifier = ''
  let password = ''
  try {
    const b = await req.json()
    if (typeof b.identifier === 'string') identifier = b.identifier
    if (typeof b.password === 'string') password = b.password
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = await resolveLoginEmail(identifier)
  if (!email) {
    const needsKey = !identifier.trim().includes('@') && !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    return NextResponse.json(
      {
        error: needsKey
          ? 'Username sign-in isn’t available on this server yet. Use the email address you registered with.'
          : 'No account matches that email or username.',
      },
      { status: 400 },
    )
  }

  if (!password) {
    return NextResponse.json({ error: 'Password is required.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const response = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signErr) {
    return NextResponse.json({ error: signErr.message }, { status: 401 })
  }

  return response
}
