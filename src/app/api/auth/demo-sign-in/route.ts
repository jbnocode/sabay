import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Signs in a shared demo user. Set DEMO_SIGNIN_PASSWORD in the server environment
 * (e.g. .env.local). Optional: DEMO_SIGNIN_EMAIL (default demo@sabay.app).
 */
export async function POST() {
  const password = process.env.DEMO_SIGNIN_PASSWORD?.trim()
  if (!password) {
    return NextResponse.json({ error: 'Demo sign-in is not configured.' }, { status: 503 })
  }

  const email = (process.env.DEMO_SIGNIN_EMAIL ?? 'demo@sabay.app').trim().toLowerCase()
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Invalid demo email configuration.' }, { status: 500 })
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

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return response
}
