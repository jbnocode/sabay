'use client'
import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Clock, Car } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPHP } from '@/lib/utils'
import type { LatLng } from '@/lib/matching/geometry'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PlaceAutocomplete from '@/components/places/PlaceAutocomplete'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false })

/** Bias place search toward Metro Manila ([lng, lat]). */
const SEARCH_BIAS: { lng: number; lat: number } = { lng: 121.0244, lat: 14.5547 }

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

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!pickup || !dropoff) return
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
              onChange={e => setRadius(parseInt(e.target.value))}
              className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 focus:border-emerald-500 focus:outline-none"
            >
              <option value={500}>500 m</option>
              <option value={1000}>1 km</option>
              <option value={1500}>1.5 km</option>
            </select>
          </div>
        </div>

        <Button
          type="submit"
          loading={loading}
          disabled={!pickup || !dropoff}
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
              onClick={() => setSelectedRoute(s => s?.id === r.id ? null : r)}
              className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all ${
                selectedRoute?.id === r.id
                  ? 'border-emerald-400 ring-2 ring-emerald-100'
                  : 'border-gray-100 hover:border-emerald-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{r.driver_name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {r.origin_label} → {r.destination_label}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-1">
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
                <div className="text-right shrink-0">
                  <p className="text-lg font-extrabold text-emerald-600">
                    {r.effective_fare_php ? formatPHP(r.effective_fare_php) : '—'}
                  </p>
                  <p className="text-xs text-gray-400">per seat</p>
                </div>
              </div>

              {selectedRoute?.id === r.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  <p className="text-xs text-gray-500">
                    Your pick-up and drop-off will be sent as a request for the driver to approve.
                  </p>
                  <Input
                    label="Note to driver (optional)"
                    placeholder="e.g. I'll be at the 7-Eleven corner"
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
