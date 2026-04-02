'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { UserProfile } from '@/types/database'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/sign-in'); return }
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (data) {
        setProfile(data as UserProfile)
        setDisplayName(data.display_name ?? '')
      }
      setLoading(false)
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    await supabase.from('users').update({ display_name: displayName }).eq('id', profile.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  if (loading) return <div className="py-20 text-center text-sm text-gray-400 animate-pulse">Loading…</div>

  return (
    <div className="space-y-8 pb-12">
      <h1 className="text-2xl font-extrabold text-gray-900">Profile</h1>

      <form onSubmit={handleSave} className="space-y-4 bg-white rounded-2xl border border-gray-100 p-5">
        <Input
          label="Display name"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="e.g. Juan de la Cruz"
        />
        <Input
          label="Email"
          value={profile?.id ? '(from Supabase Auth)' : ''}
          disabled
        />
        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving} size="sm">Save</Button>
          {saved && <span className="text-xs text-emerald-600 font-medium">Saved!</span>}
        </div>
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Account</p>
        <Button variant="danger" size="sm" onClick={handleSignOut}>Sign out</Button>
      </div>
    </div>
  )
}
