import TopBar from '@/components/nav/TopBar'
import LandingHero from '@/components/landing/LandingHero'
import LandingFeatures from '@/components/landing/LandingFeatures'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <TopBar />
      <div className="relative flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/landing-map-bg.png')" }}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-white/10 to-white/40"
          aria-hidden
        />
        <main className="relative z-10 flex w-full flex-1 items-center py-8 sm:py-10">
          <div className="mx-auto w-full max-w-2xl px-4">
            <LandingHero />
          </div>
        </main>
      </div>
      <LandingFeatures />
    </div>
  )
}
