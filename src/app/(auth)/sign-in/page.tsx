'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PasswordInput from '@/components/ui/PasswordInput'

const showDemoSignIn =
  process.env.NEXT_PUBLIC_ENABLE_DEMO_SIGNIN === 'true' || process.env.NODE_ENV === 'development'

export default function SignInPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorHint, setErrorHint] = useState('')
  const router = useRouter()

  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setErrorHint('')
    const idTrim = identifier.trim()
    if (!idTrim) {
      setError('Enter your email or username.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: idTrim, password }),
        credentials: 'same-origin',
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok) {
        setLoading(false)
        setError(body.error || 'Sign-in failed')
        if (res.status === 401) {
          setErrorHint(
            'Check your password. If you just signed up, confirm your email first if your project requires it.',
          )
        }
        return
      }
    } catch {
      setLoading(false)
      setError('Network error. Try again.')
      return
    }
    setLoading(false)
    router.push('/')
    router.refresh()
  }

  async function handleDemoSignIn() {
    setError('')
    setErrorHint('')
    setDemoLoading(true)
    try {
      const res = await fetch('/api/auth/demo-sign-in', {
        method: 'POST',
        credentials: 'same-origin',
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok) {
        setDemoLoading(false)
        setError(body.error || 'Demo sign-in failed')
        if (res.status === 503) {
          setErrorHint('Add DEMO_SIGNIN_PASSWORD to your server environment (e.g. .env.local).')
        }
        return
      }
    } catch {
      setDemoLoading(false)
      setError('Network error. Try again.')
      return
    }
    setDemoLoading(false)
    router.push('/profile')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <Link href="/" className="text-2xl font-extrabold text-emerald-600">
            Sabay
          </Link>
          <p className="text-sm text-gray-500">One account — post a ride or find one</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          {error ? (
            <div className="space-y-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-left">
              <p className="text-sm font-medium text-red-700">{error}</p>
              {errorHint ? <p className="text-xs leading-relaxed text-red-600/90">{errorHint}</p> : null}
            </div>
          ) : null}

          <Input
            label="Email or username"
            name="username"
            autoComplete="username"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="you@example.com or your handle"
            required
          />

          <PasswordInput
            label="Password"
            name="current-password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your password"
            required
          />

          <Button
            type="submit"
            className="w-full justify-center"
            size="lg"
            loading={loading}
            disabled={demoLoading}
          >
            Post or find a ride now
          </Button>

          {showDemoSignIn ? (
            <div className="space-y-3">
              <div className="relative flex items-center justify-center py-1">
                <div className="absolute inset-x-0 top-1/2 h-px bg-gray-100" aria-hidden />
                <span className="relative bg-white px-2 text-xs font-medium text-gray-400">or</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center"
                size="lg"
                loading={demoLoading}
                disabled={loading}
                onClick={() => void handleDemoSignIn()}
              >
                Log in with demo account
              </Button>
              <p className="text-center text-[11px] leading-snug text-gray-400">
                Shared demo profile for trying Sabay — no signup needed.
              </p>
            </div>
          ) : null}

          <p className="text-center text-xs text-gray-500">
            New here?{' '}
            <Link href="/sign-up" className="font-medium text-emerald-600 hover:text-emerald-700">
              Sign up
            </Link>
          </p>
        </form>

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
