'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Car, UserCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AuthError } from '@supabase/supabase-js'
import Button from '@/components/ui/Button'

/** Must match `supabase/seed_demo_users.sql`. Optional: NEXT_PUBLIC_SABAY_DEMO_PASSWORD in .env.local */
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_SABAY_DEMO_PASSWORD ?? 'SabayDemo2026!'

const DEMO_DRIVER_EMAIL = 'driver@demo.sabay.app'
const DEMO_PASSENGER_EMAIL = 'passenger@demo.sabay.app'

export default function SignInPage() {
  const [driverLoading, setDriverLoading] = useState(false)
  const [passengerLoading, setPassengerLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorHint, setErrorHint] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function signInDemo(
    email: string,
    setBusy: (v: boolean) => void
  ) {
    setError('')
    setErrorHint('')
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password: DEMO_PASSWORD,
    })
    setBusy(false)
    if (err) {
      const ae = err as AuthError
      const status = typeof ae.status === 'number' ? ae.status : undefined
      setError(err.message || 'Sign-in failed')
      // 500 from Supabase Auth is not the same as 401 "Invalid API key" (that was the seed script).
      if (status === 500 || /internal server error|500/i.test(err.message)) {
        setErrorHint(
          'Supabase Auth returned a server error. Check Dashboard → Logs → Auth for the stack trace. Typical fixes: enable Email provider with password (Authentication → Providers → Email), confirm demo users exist (run seed_demo_users.sql), and ensure NEXT_PUBLIC_SABAY_DEMO_PASSWORD matches the seeded password if you changed it.'
        )
      } else if (/invalid login|invalid credentials|email not confirmed/i.test(err.message)) {
        setErrorHint(
          'Wrong password or email not confirmed. Default demo password is SabayDemo2026! unless you set NEXT_PUBLIC_SABAY_DEMO_PASSWORD.'
        )
      }
      return
    }
    router.push('/find-ride')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center space-y-1">
          <Link href="/" className="text-2xl font-extrabold text-emerald-600">
            Sabay
          </Link>
          <p className="text-gray-500 text-sm">Demo sign-in (MVP)</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 text-center">
            Log in as a demo user
          </p>
          {error ? (
            <div className="text-left space-y-2 bg-red-50 rounded-xl px-3 py-2 border border-red-100">
              <p className="text-sm text-red-700 font-medium">{error}</p>
              {errorHint ? (
                <p className="text-xs text-red-600/90 leading-relaxed">{errorHint}</p>
              ) : null}
            </div>
          ) : null}
          <Button
            type="button"
            className="w-full justify-center gap-2"
            size="lg"
            loading={driverLoading}
            disabled={passengerLoading}
            onClick={() => signInDemo(DEMO_DRIVER_EMAIL, setDriverLoading)}
          >
            <Car size={20} strokeWidth={1.8} />
            Log in as driver
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center gap-2"
            size="lg"
            loading={passengerLoading}
            disabled={driverLoading}
            onClick={() => signInDemo(DEMO_PASSENGER_EMAIL, setPassengerLoading)}
          >
            <UserCircle size={20} strokeWidth={1.8} />
            Log in as passenger
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400">
          By continuing you agree to our{' '}
          <a href="#" className="underline">
            Terms
          </a>{' '}
          and{' '}
          <a href="#" className="underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  )
}
