import Link from 'next/link'
import TopBar from '@/components/nav/TopBar'
import Button from '@/components/ui/Button'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center py-16 gap-8">
        {/* Hero */}
        <div className="space-y-3 max-w-sm">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm font-semibold px-3 py-1 rounded-full">
            Metro Manila only · Beta
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 leading-tight">
            Beat traffic.<br />Share the ride.
          </h1>
          <p className="text-gray-500 text-base">
            Carpool across Makati, BGC, Ortigas &amp; QC.
            Split fuel costs. No app download needed.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Link href="/find-ride">
            <Button size="lg" className="w-full">Find a Ride</Button>
          </Link>
          <Link href="/post-ride">
            <Button size="lg" variant="secondary" className="w-full">Post a Ride</Button>
          </Link>
        </div>

        {/* Trust strip */}
        <div className="flex items-center gap-6 text-xs text-gray-400 mt-4">
          <span>OTP verified</span>
          <span>·</span>
          <span>Plate visible</span>
          <span>·</span>
          <span>Free MVP</span>
        </div>
      </main>
    </div>
  )
}
