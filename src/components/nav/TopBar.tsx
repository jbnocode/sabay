import Link from 'next/link'
import NavDrawer from './NavDrawer'
import { createClient } from '@/lib/supabase/server'

export default async function TopBar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="sticky top-0 z-30 w-full bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-2xl mx-auto flex items-center justify-between px-4 h-14">
        <Link href="/" className="text-xl font-extrabold text-emerald-600 tracking-tight">
          Sabay
        </Link>
        <NavDrawer isLoggedIn={!!user} />
      </div>
    </header>
  )
}
