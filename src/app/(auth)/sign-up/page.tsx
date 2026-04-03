'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PasswordInput from '@/components/ui/PasswordInput'

export default function SignUpPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
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
    setInfo('')
    const u = username.trim().replace(/^@+/, '')
    if (u.length < 2) {
      setError('Username must be at least 2 characters.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error: err, data } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: u,
          display_name: u,
          role: 'both',
        },
      },
    })
    setLoading(false)
    if (err) {
      const status = 'status' in err ? (err as { status?: number }).status : undefined
      if (status === 429 || /too many requests|429/i.test(err.message)) {
        setError(
          'Too many sign-up tries from this browser or network. Wait several minutes, or sign in if you already registered.',
        )
        return
      }
      setError(err.message || 'Could not create account')
      if (/already registered|already been registered/i.test(err.message)) {
        setError('An account with this email already exists. Try signing in.')
      }
      return
    }
    if (data.session) {
      router.push('/')
      router.refresh()
      return
    }
    if (data.user) {
      const { data: second, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (!signInErr && second.session) {
        router.push('/')
        router.refresh()
        return
      }
    }
    setInfo('You’re on the waitlist. Sign in with the same email and password.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Link href="/" className="text-2xl font-extrabold text-emerald-600">
            Sabay
          </Link>
          <p className="text-sm font-semibold text-gray-800">Demo sign-up (not a real account)</p>
          <p className="text-xs leading-relaxed text-gray-500">
            Sabay is still in preview. Accounts here are for trying the product only — they are not full production accounts.
            When you sign up, we add your email to the waitlist and may contact you when we open more broadly.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          {error ? (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          {info ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</div>
          ) : null}

          <Input
            label="Username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="e.g. juankarlos"
            required
          />

          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <PasswordInput
            label="Password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
          />

          <PasswordInput
            label="Confirm password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password"
            required
          />

          <Button type="submit" className="w-full justify-center" size="lg" loading={loading}>
            Create account
          </Button>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-semibold text-emerald-600 hover:text-emerald-700">
              Sign in
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
