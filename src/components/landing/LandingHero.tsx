'use client'
import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PlaceAutocomplete from '@/components/places/PlaceAutocomplete'
import Button from '@/components/ui/Button'
import type { LatLng } from '@/lib/matching/geometry'

const SEARCH_BIAS: { lng: number; lat: number } = { lng: 121.0244, lat: 14.5547 }
export const FIND_RIDE_PREFILL_KEY = 'sabay_find_ride_prefill'

function samePoint(a: LatLng | null, b: LatLng | null) {
  if (!a || !b) return false
  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5
}

export default function LandingHero() {
  const router = useRouter()
  const [pickup, setPickup] = useState<LatLng | null>(null)
  const [dropoff, setDropoff] = useState<LatLng | null>(null)
  const [pickupLabel, setPickupLabel] = useState('')
  const [dropoffLabel, setDropoffLabel] = useState('')
  const [date, setDate] = useState('')

  const onPickupResolved = useCallback((place: LatLng & { label: string }) => {
    setPickup({ lat: place.lat, lng: place.lng })
    setPickupLabel(place.label)
  }, [])

  const onDropoffResolved = useCallback((place: LatLng & { label: string }) => {
    setDropoff({ lat: place.lat, lng: place.lng })
    setDropoffLabel(place.label)
  }, [])

  function goFindRide() {
    if (pickup && dropoff && !samePoint(pickup, dropoff)) {
      try {
        sessionStorage.setItem(
          FIND_RIDE_PREFILL_KEY,
          JSON.stringify({
            pickupLabel,
            dropoffLabel,
            pickup,
            dropoff,
            date: date || '',
          }),
        )
      } catch {
        /* private mode / quota */
      }
    }
    router.push('/find-ride')
  }

  return (
    <div className="relative z-10 w-full max-w-[300px] sm:max-w-[340px]">
      <div className="space-y-4 rounded-2xl bg-white/95 p-4 shadow-xl shadow-gray-900/10 ring-1 ring-black/[0.06] backdrop-blur-md sm:p-5 sm:space-y-4">
        <div className="space-y-1.5">
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl">
            Find a Ride
          </h1>
          <p className="text-xs leading-relaxed text-gray-500 sm:text-[13px]">
            Community-led carpooling for Metro Manila — share seats, split costs, and ride together.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">
              Departure point
            </label>
            <PlaceAutocomplete
              hideLabel
              label="Departure point"
              placeholder="Where are you leaving from?"
              value={pickupLabel}
              onTextChange={(t) => {
                setPickupLabel(t)
                if (!t.trim()) setPickup(null)
              }}
              onResolved={onPickupResolved}
              bias={SEARCH_BIAS}
              className="gap-0"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">
              Destination
            </label>
            <PlaceAutocomplete
              hideLabel
              label="Destination"
              placeholder="Where are you going?"
              value={dropoffLabel}
              onTextChange={(t) => {
                setDropoffLabel(t)
                if (!t.trim()) setDropoff(null)
              }}
              onResolved={onDropoffResolved}
              bias={SEARCH_BIAS}
              className="gap-0"
            />
          </div>

          <div>
            <label
              htmlFor="landing-date"
              className="mb-1 block text-xs font-medium text-gray-700 sm:text-sm"
            >
              Date
            </label>
            <input
              id="landing-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 pt-0.5 sm:grid-cols-2 sm:gap-3">
          <Button type="button" size="lg" className="min-h-[44px] w-full py-2.5 text-sm sm:text-base" onClick={goFindRide}>
            Find a Ride
          </Button>
          <Link
            href="/post-ride"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:text-base"
          >
            Post a Ride
          </Link>
        </div>
      </div>
    </div>
  )
}
