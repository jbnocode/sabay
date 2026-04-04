'use client'
import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Clock, Car, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPHP } from '@/lib/utils'
import type { LatLng } from '@/lib/matching/geometry'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PlaceAutocomplete from '@/components/places/PlaceAutocomplete'
import { FIND_RIDE_PREFILL_KEY } from '@/components/landing/LandingHero'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false })

/** Bias place search toward Metro Manila ([lng, lat]). */
const SEARCH_BIAS: { lng: number; lat: number } = { lng: 121.0244, lat: 14.5547 }

/** Corridor width for matching pick-up / drop-off to a route (500 m steps, up to 5 km). */
const RADIUS_OPTIONS_METERS = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000] as const

function formatRadiusLabel(meters: number): string {
  if (meters < 1000) return `${meters} m`
  return `${meters / 1000} km`
}

interface RouteResult {
  id: string
  driver_name: string
  origin_label: string
  destination_label: string
  departure_time: string
  frequency: string
  distance_km: number
  vehicle_type: string
  seats_available: number
  effective_fare_php: number
  route_geojson?: GeoJSON.LineString
  pickup_fraction: number
  dropoff_fraction: number
}

export default function FindRidePage() {
  const router = useRouter()
  const supabase = createClient()

  const [pickup, setPickup] = useState<LatLng | null>(null)
  const [dropoff, setDropoff] = useState<LatLng | null>(null)
  const [pickupLabel, setPickupLabel] = useState('')
  const [dropoffLabel, setDropoffLabel] = useState('')
  const [date, setDate] = useState('')
  const [radius, setRadius] = useState(1000)

  const [results, setResults] = useState<RouteResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedRoute, setSelectedRoute] = useState<RouteResult | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestNote, setRequestNote] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  const onPickupResolved = useCallback((place: LatLng & { label: string }) => {
    setPickup({ lat: place.lat, lng: place.lng })
    setPickupLabel(place.label)
  }, [])

  const onDropoffResolved = useCallback((place: LatLng & { label: string }) => {
    setDropoff({ lat: place.lat, lng: place.lng })
    setDropoffLabel(place.label)
  }, [])

  useEffect(() => {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(FIND_RIDE_PREFILL_KEY)
      if (raw) sessionStorage.removeItem(FIND_RIDE_PREFILL_KEY)
    } catch {
      return
    }
    if (!raw) return
    try {
      const p = JSON.parse(raw) as {
        pickupLabel?: string
        dropoffLabel?: string
        pickup?: LatLng
        dropoff?: LatLng
        date?: string
      }
      if (typeof p.pickupLabel === 'string') setPickupLabel(p.pickupLabel)
      if (typeof p.dropoffLabel === 'string') setDropoffLabel(p.dropoffLabel)
      if (p.pickup != null && typeof p.pickup.lat === 'number' && typeof p.pickup.lng === 'number') {
        setPickup({ lat: p.pickup.lat, lng: p.pickup.lng })
      }
      if (p.dropoff != null && typeof p.dropoff.lat === 'number' && typeof p.dropoff.lng === 'number') {
        setDropoff({ lat: p.dropoff.lat, lng: p.dropoff.lng })
      }
      if (typeof p.date === 'string' && p.date) setDate(p.date)
    } catch {
      /* invalid JSON */
    }
  }, [])

  const samePickupAndDropoff =
    !!pickup &&
    !!dropoff &&
    Math.abs(pickup.lat - dropoff.lat) < 1e-5 &&
    Math.abs(pickup.lng - dropoff.lng) < 1e-5

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!pickup || !dropoff || samePickupAndDropoff) return
    setLoading(true)
    setSearched(false)
    setSelectedRoute(null)

    const params = new URLSearchParams({
      oLat: String(pickup.lat), oLng: String(pickup.lng),
      dLat: String(dropoff.lat), dLng: String(dropoff.lng),
      radius: String(radius),
      ...(date ? { date } : {}),
    })
    const res = await fetch(`/api/routes/search?${params}`)
    const data = await res.json()
    setResults(data.routes ?? [])
    setSearched(true)
    setLoading(false)
  }

  async function handleRequest() {
    if (!selectedRoute || !pickup || !dropoff) return
    setRequestError('')
    setRequesting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/sign-in'); return }

    const { error } = await supabase.from('ride_stop_requests').insert({
      driver_route_id: selectedRoute.id,
      passenger_id: user.id,
      pickup_geom: `POINT(${pickup.lng} ${pickup.lat})`,
      dropoff_geom: `POINT(${dropoff.lng} ${dropoff.lat})`,
      pickup_label: pickupLabel,
      dropoff_label: dropoffLabel,
      pickup_fraction: selectedRoute.pickup_fraction,
      dropoff_fraction: selectedRoute.dropoff_fraction,
      passenger_note: requestNote || null,
    })
    setRequesting(false)

    if (error) { setRequestError(error.message); return }
    setRequestSent(true)
  }

  const FREQ_LABELS: Record<string, string> = {
    once: 'One-time', daily: 'Daily', weekdays: 'Mon–Fri',
    mwf: 'Mon/Wed/Fri', custom: 'Custom',
  }

  if (requestSent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="text-5xl">🙌</div>
        <h2 className="text-xl font-bold">Request sent!</h2>
        <p className="text-gray-500 text-sm max-w-xs">
          The driver will review your pickup and drop-off point and let you know.
        </p>
        <Button onClick={() => { setRequestSent(false); setSelectedRoute(null) }}>
          Search again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Find a Ride</h1>
        <p className="text-sm text-gray-500 mt-1">
          Search for pick-up and drop-off; the map shows your selections (GrabMaps in Metro Manila when configured).
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PlaceAutocomplete
            label="Pick-up location"
            placeholder="e.g. Trinoma, Quezon City"
            value={pickupLabel}
            onTextChange={(t) => {
              setPickupLabel(t)
              if (!t.trim()) setPickup(null)
            }}
            onResolved={onPickupResolved}
            bias={SEARCH_BIAS}
          />
          <PlaceAutocomplete
            label="Drop-off location"
            placeholder="e.g. Ayala Avenue, Makati"
            value={dropoffLabel}
            onTextChange={(t) => {
              setDropoffLabel(t)
              if (!t.trim()) setDropoff(null)
            }}
            onResolved={onDropoffResolved}
            bias={SEARCH_BIAS}
          />
        </div>

        <RouteMap
          pickupPoint={pickup}
          dropoffPoint={dropoff}
          routeGeoJson={selectedRoute?.route_geojson ?? null}
          className="h-64 w-full rounded-2xl overflow-hidden border border-gray-200"
        />
      </div>

      <form onSubmit={handleSearch} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date (optional)"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Search radius</label>
            <select
              value={radius}
              onChange={e => setRadius(parseInt(e.target.value, 10))}
              className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 focus:border-emerald-500 focus:outline-none"
            >
              {RADIUS_OPTIONS_METERS.map(m => (
                <option key={m} value={m}>
                  {formatRadiusLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {samePickupAndDropoff && (
          <p className="text-xs text-amber-700">
            Choose two different places — pick-up must be before drop-off along the driver&apos;s route.
          </p>
        )}
        <Button
          type="submit"
          loading={loading}
          disabled={!pickup || !dropoff || samePickupAndDropoff}
          className="w-full"
        >
          Search rides
        </Button>
      </form>

      {searched && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">
            {results.length === 0
              ? 'No matching rides found — try a larger radius or different date.'
              : `${results.length} ride${results.length > 1 ? 's' : ''} match your route`}
          </p>

          {results.map(r => (
            <div
              key={r.id}
              className={`bg-white rounded-2xl border p-4 transition-all ${
                selectedRoute?.id === r.id
                  ? 'border-emerald-400 ring-2 ring-emerald-100'
                  : 'border-gray-100'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedRoute(s => s?.id === r.id ? null : r)}
                className={`w-full text-left rounded-xl -m-1 p-1 cursor-pointer transition-colors ${
                  selectedRoute?.id === r.id ? '' : 'hover:bg-gray-50/80'
                }`}
              >
                <div className="space-y-2 w-full">
                  <div className="space-y-2">
                    <p className="flex gap-2 items-start text-sm sm:text-[0.95rem] leading-snug font-medium text-gray-900">
                      <span
                        className="flex h-[11px] w-[11px] shrink-0 items-center justify-center text-red-600"
                        aria-hidden
                      >
                        <MapPin className="block" size={11} strokeWidth={2.5} />
                      </span>
                      <span className="min-w-0 break-words">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-red-700 leading-none">
                          Near pick-up
                        </span>
                        <span className="block mt-1">{r.origin_label}</span>
                      </span>
                    </p>
                    <p className="flex gap-2 items-start text-sm sm:text-[0.95rem] leading-snug font-medium text-gray-900">
                      <span
                        className="flex h-[11px] w-[11px] shrink-0 items-center justify-center text-blue-600"
                        aria-hidden
                      >
                        <MapPin className="block" size={11} strokeWidth={2.5} />
                      </span>
                      <span className="min-w-0 break-words">
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-800/90 leading-none">
                          Near drop-off
                        </span>
                        <span className="block mt-1">{r.destination_label}</span>
                      </span>
                    </p>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-xs text-gray-500">
                        Driver: <span className="text-gray-700 font-medium">{r.driver_name}</span>
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {r.departure_time?.slice(0, 5)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Car size={11} /> {r.vehicle_type}
                        </span>
                        <span>{FREQ_LABELS[r.frequency] ?? r.frequency}</span>
                        <span>{r.seats_available} seat{r.seats_available !== 1 ? 's' : ''} left</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 self-start">
                      <p className="text-lg font-extrabold text-emerald-600 leading-tight tabular-nums">
                        {r.effective_fare_php ? formatPHP(r.effective_fare_php) : '—'}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                        per passenger seat
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              {selectedRoute?.id === r.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  <p className="text-xs text-gray-500">
                    Your pick-up and drop-off will be sent as a request for the driver to approve.
                  </p>
                  <Input
                    label="Note to driver"
                    placeholder="Optional — e.g. I'll be at the 7-Eleven corner"
                    value={requestNote}
                    onChange={e => setRequestNote(e.target.value)}
                  />
                  {requestError && <p className="text-xs text-red-500">{requestError}</p>}
                  <Button
                    className="w-full"
                    loading={requesting}
                    onClick={handleRequest}
                  >
                    Send pickup request
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
