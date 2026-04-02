'use client'
import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculateFare, isFareOverrideWarning, FARE_MIN_PHP } from '@/lib/fare/calculator'
import { formatPHP } from '@/lib/utils'
import type { LatLng } from '@/lib/matching/geometry'
import type { VehicleType, RouteFrequency } from '@/types/database'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PlaceAutocomplete from '@/components/places/PlaceAutocomplete'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false })

const SEARCH_BIAS: { lng: number; lat: number } = { lng: 121.0244, lat: 14.5547 }

type PickingMode = 'origin' | 'destination' | null

const VEHICLE_TYPES: { value: VehicleType; label: string; efficiency: string }[] = [
  { value: 'hatchback', label: 'Hatchback', efficiency: '12 km/L' },
  { value: 'sedan', label: 'Sedan', efficiency: '10 km/L' },
  { value: 'suv', label: 'SUV', efficiency: '8 km/L' },
]

const FREQUENCIES: { value: RouteFrequency; label: string }[] = [
  { value: 'once', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays (M–F)' },
  { value: 'mwf', label: 'Mon / Wed / Fri' },
]

export default function PostRidePage() {
  const router = useRouter()
  const supabase = createClient()

  const [origin, setOrigin] = useState<LatLng | null>(null)
  const [destination, setDestination] = useState<LatLng | null>(null)
  const [originLabel, setOriginLabel] = useState('')
  const [destinationLabel, setDestinationLabel] = useState('')
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.LineString | null>(null)
  const [distanceKm, setDistanceKm] = useState(0)
  const [durationHours, setDurationHours] = useState(0)
  const [picking, setPicking] = useState<PickingMode>(null)
  const [routeLoading, setRouteLoading] = useState(false)

  const [departureTime, setDepartureTime] = useState('07:30')
  const [departureDate, setDepartureDate] = useState('')
  const [frequency, setFrequency] = useState<RouteFrequency>('weekdays')

  const [vehicleType, setVehicleType] = useState<VehicleType>('sedan')
  const [gasPrice, setGasPrice] = useState(62)
  const [seats, setSeats] = useState(3)
  const [overrideFare, setOverrideFare] = useState<string>('')
  const [plateTag, setPlateTag] = useState('')

  const fareBreakdown =
    distanceKm > 0
      ? calculateFare({ vehicleType, gasPricePHP: gasPrice, distanceKm, durationHours, seats })
      : null

  const computedFare = fareBreakdown?.roundedPerSeatPHP ?? 0
  const overrideFareNum = overrideFare ? parseFloat(overrideFare) : null
  const effectiveFare = overrideFareNum ?? computedFare
  const showOverrideWarning =
    overrideFareNum !== null && computedFare > 0 && isFareOverrideWarning(computedFare, overrideFareNum)
  const overrideError =
    overrideFareNum !== null && overrideFareNum < FARE_MIN_PHP
      ? `Minimum fare is ₱${FARE_MIN_PHP}`
      : undefined

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fetchRoute = useCallback(async (o: LatLng, d: LatLng) => {
    setRouteLoading(true)
    try {
      const res = await fetch('/api/routes/snap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin: o, destination: d }),
      })
      if (!res.ok) throw new Error('Route fetch failed')
      const data = await res.json()
      setRouteGeoJson(data.geometry)
      setDistanceKm(data.distanceKm)
      setDurationHours(data.durationHours)
    } catch {
      setRouteGeoJson(null)
    } finally {
      setRouteLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!origin || !destination) {
      setRouteGeoJson(null)
      setDistanceKm(0)
      setDurationHours(0)
      return
    }
    void fetchRoute(origin, destination)
  }, [origin, destination, fetchRoute])

  const handleMapClick = useCallback(
    (lngLat: LatLng) => {
      if (!picking) return
      if (picking === 'origin') {
        setOrigin(lngLat)
        setOriginLabel(`${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`)
      } else {
        setDestination(lngLat)
        setDestinationLabel(`${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`)
      }
      setPicking(null)
    },
    [picking]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    if (!origin || !destination) { setSaveError('Set your start and end location.'); return }
    if (!departureDate) { setSaveError('Pick a departure date.'); return }
    if (overrideError) return

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/sign-in'); return }

    const { error } = await supabase.from('driver_routes').insert({
      driver_id: user.id,
      status: 'active',
      frequency,
      departure_time: departureTime,
      first_departure_date: departureDate,
      origin_label: originLabel,
      destination_label: destinationLabel,
      origin_geom: `POINT(${origin.lng} ${origin.lat})`,
      destination_geom: `POINT(${destination.lng} ${destination.lat})`,
      route_geojson: routeGeoJson,
      distance_km: distanceKm || null,
      duration_hours: durationHours || null,
      vehicle_type: vehicleType,
      gas_price_php_per_l: gasPrice,
      computed_fare_php: computedFare || null,
      override_fare_php: overrideFareNum,
      seats_available: seats,
    })
    setSaving(false)

    if (error) { setSaveError(error.message); return }
    router.push('/inbox')
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Post a Ride</h1>
        <p className="text-sm text-gray-500 mt-1">
          Search start and end, then set your schedule (GrabMaps when configured in AWS).
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700">1. Route</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PlaceAutocomplete
            label="Start location"
            placeholder="e.g. Fairview, Quezon City"
            value={originLabel}
            onTextChange={(t) => {
              setOriginLabel(t)
              if (!t.trim()) setOrigin(null)
            }}
            onResolved={(p) => {
              setOrigin({ lat: p.lat, lng: p.lng })
              setOriginLabel(p.label)
            }}
            bias={SEARCH_BIAS}
          />
          <PlaceAutocomplete
            label="End location"
            placeholder="e.g. BGC, Taguig"
            value={destinationLabel}
            onTextChange={(t) => {
              setDestinationLabel(t)
              if (!t.trim()) setDestination(null)
            }}
            onResolved={(p) => {
              setDestination({ lat: p.lat, lng: p.lng })
              setDestinationLabel(p.label)
            }}
            bias={SEARCH_BIAS}
          />
        </div>

        <p className="text-xs text-gray-500">
          Or set a point on the map:
          <button
            type="button"
            className={`ml-2 font-medium underline-offset-2 hover:underline ${picking === 'origin' ? 'text-emerald-700' : 'text-gray-700'}`}
            onClick={() => setPicking(p => p === 'origin' ? null : 'origin')}
          >
            {origin ? 'Adjust start on map' : 'Choose start on map'}
          </button>
          <span className="mx-1 text-gray-300">·</span>
          <button
            type="button"
            className={`font-medium underline-offset-2 hover:underline ${picking === 'destination' ? 'text-emerald-700' : 'text-gray-700'}`}
            onClick={() => setPicking(p => p === 'destination' ? null : 'destination')}
          >
            {destination ? 'Adjust end on map' : 'Choose end on map'}
          </button>
          {routeLoading && <span className="ml-2 text-emerald-600 animate-pulse">Getting route…</span>}
        </p>

        <RouteMap
          origin={origin}
          destination={destination}
          routeGeoJson={routeGeoJson}
          onMapClick={handleMapClick}
          picking={picking}
          className="h-64 w-full rounded-2xl overflow-hidden border border-gray-200"
        />

        {distanceKm > 0 && (
          <p className="text-xs text-gray-500">
            Route: <strong>{distanceKm.toFixed(1)} km</strong> · ~{Math.round(durationHours * 60)} min
          </p>
        )}
      </div>

      <hr className="border-gray-100" />

      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm font-semibold text-gray-700">2. Schedule</p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Departure time"
            type="time"
            value={departureTime}
            onChange={e => setDepartureTime(e.target.value)}
          />
          <Input
            label="First date"
            type="date"
            value={departureDate}
            onChange={e => setDepartureDate(e.target.value)}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Frequency</p>
          <div className="grid grid-cols-2 gap-2">
            {FREQUENCIES.map(f => (
              <label key={f.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="frequency"
                  value={f.value}
                  checked={frequency === f.value}
                  onChange={() => setFrequency(f.value)}
                  className="accent-emerald-600"
                />
                <span className="text-sm text-gray-700">{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        <hr className="border-gray-100" />

        <p className="text-sm font-semibold text-gray-700">3. Vehicle</p>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Vehicle type</p>
          <div className="grid grid-cols-3 gap-2">
            {VEHICLE_TYPES.map(v => (
              <button
                key={v.value}
                type="button"
                onClick={() => setVehicleType(v.value)}
                className={`py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${
                  vehicleType === v.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="font-semibold">{v.label}</div>
                <div className="text-xs opacity-70">{v.efficiency}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Seats available"
            type="number"
            min={1}
            max={6}
            value={seats}
            onChange={e => setSeats(parseInt(e.target.value) || 1)}
          />
          <Input
            label="Plate (last 3)"
            placeholder="e.g. A23"
            maxLength={3}
            value={plateTag}
            onChange={e => setPlateTag(e.target.value.toUpperCase())}
          />
        </div>

        <hr className="border-gray-100" />

        <p className="text-sm font-semibold text-gray-700">4. Fare per seat</p>
        <Input
          label="Current gas price (₱/L)"
          type="number"
          min={50}
          step={0.5}
          value={gasPrice}
          onChange={e => setGasPrice(parseFloat(e.target.value) || 62)}
          hint="Check DOE weekly bulletin or your last fill-up receipt"
        />

        {fareBreakdown && (
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1 border border-gray-100">
            <p className="font-semibold text-gray-700 mb-2">Fare breakdown</p>
            <div className="flex justify-between text-gray-500">
              <span>Fuel cost</span><span>{formatPHP(fareBreakdown.fuelCostPHP)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Time value</span><span>{formatPHP(fareBreakdown.timeCostPHP)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>× maintenance factor</span><span>1.1×</span>
            </div>
            <div className="border-t border-gray-200 pt-2 mt-1 flex justify-between font-bold text-gray-800">
              <span>Suggested per seat</span><span>{formatPHP(fareBreakdown.roundedPerSeatPHP)}</span>
            </div>
          </div>
        )}

        <Input
          label="Override fare per seat (₱) — optional"
          type="number"
          min={FARE_MIN_PHP}
          step={5}
          placeholder={computedFare > 0 ? `Suggested: ₱${computedFare}` : 'e.g. 150'}
          value={overrideFare}
          onChange={e => setOverrideFare(e.target.value)}
          hint="Leave blank to use the suggested fare"
          error={overrideError}
        />

        {showOverrideWarning && (
          <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
            Your override (₱{overrideFareNum}) is more than 3× the suggested fare (₱{computedFare}). Passengers will see this.
          </div>
        )}

        {effectiveFare > 0 && (
          <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-emerald-700">Fare to show passengers</span>
            <span className="text-xl font-extrabold text-emerald-700">{formatPHP(effectiveFare)}</span>
          </div>
        )}

        {saveError && <p className="text-sm text-red-500">{saveError}</p>}

        <Button type="submit" loading={saving} className="w-full" size="lg">
          Publish Ride
        </Button>
      </form>
    </div>
  )
}
