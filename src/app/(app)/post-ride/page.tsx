'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculateFare, isFareOverrideWarning, FARE_MIN_PHP } from '@/lib/fare/calculator'
import { formatPHP } from '@/lib/utils'
import type { LatLng } from '@/lib/matching/geometry'
import type { DriverRoute, VehicleType } from '@/types/database'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PlaceAutocomplete from '@/components/places/PlaceAutocomplete'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false })

const SEARCH_BIAS: { lng: number; lat: number } = { lng: 121.0244, lat: 14.5547 }

const VEHICLE_TYPES: { value: VehicleType; label: string; efficiency: string }[] = [
  { value: 'hatchback', label: 'Hatchback', efficiency: '12 km/L' },
  { value: 'sedan', label: 'Sedan', efficiency: '10 km/L' },
  { value: 'suv', label: 'SUV', efficiency: '8 km/L' },
]

export default function PostRidePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const editParam = searchParams.get('edit')?.trim() ?? ''

  const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
  const skipNextDepartureDayAuto = useRef(false)

  const [userLoc, setUserLoc] = useState<LatLng | null>(null)

  const [origin, setOrigin] = useState<LatLng | null>(null)
  const [destination, setDestination] = useState<LatLng | null>(null)
  const [originLabel, setOriginLabel] = useState('')
  const [destinationLabel, setDestinationLabel] = useState('')
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.LineString | null>(null)
  const [distanceKm, setDistanceKm] = useState(0)
  const [durationHours, setDurationHours] = useState(0)
  const [routeLoading, setRouteLoading] = useState(false)

  const [departureTime, setDepartureTime] = useState('07:30')
  const [departureDate, setDepartureDate] = useState('')
  // 0=Sun … 6=Sat
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5])

  const [vehicleType, setVehicleType] = useState<VehicleType>('sedan')
  const [gasPrice, setGasPrice] = useState(62)
  const [seats, setSeats] = useState(3)
  const [overrideFare, setOverrideFare] = useState<string>('')
  const [passengerNote, setPassengerNote] = useState('')
  const [plateTag, setPlateTag] = useState('')

  const fareBreakdown =
    distanceKm > 0
      ? calculateFare({
          vehicleType,
          gasPricePHP: gasPrice,
          distanceKm,
          durationHours,
          seats: Math.max(1, seats),
        })
      : null

  const computedFare = fareBreakdown?.roundedPerSeatPHP ?? 0
  const overrideFareNum = overrideFare ? parseFloat(overrideFare) : null
  const effectiveFare = overrideFareNum ?? computedFare
  const showOverrideWarning =
    overrideFareNum !== null && computedFare > 0 && isFareOverrideWarning(computedFare, overrideFareNum)
  const overrideError =
    overrideFareNum !== null && overrideFareNum < 0
      ? `Fare can't be negative`
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
    if (!editParam) {
      setEditingRouteId(null)
      return
    }
    let cancelled = false
    const sb = createClient()
    ;(async () => {
      const { data: auth } = await sb.auth.getUser()
      const user = auth?.user
      if (!user) return
      const { data, error } = await sb.from('driver_routes').select('*').eq('id', editParam).maybeSingle()
      if (cancelled || error || !data) return
      const row = data as DriverRoute
      if (row.driver_id !== user.id) return
      skipNextDepartureDayAuto.current = true
      setEditingRouteId(row.id)
      setOriginLabel(row.origin_label ?? '')
      setDestinationLabel(row.destination_label ?? '')
      const gj = row.route_geojson
      if (
        gj &&
        typeof gj === 'object' &&
        'type' in gj &&
        gj.type === 'LineString' &&
        'coordinates' in gj &&
        Array.isArray(gj.coordinates) &&
        gj.coordinates.length >= 2
      ) {
        const coords = gj.coordinates as number[][]
        const first = coords[0]
        const last = coords[coords.length - 1]
        if (first?.length >= 2 && last?.length >= 2) {
          setOrigin({ lng: first[0], lat: first[1] })
          setDestination({ lng: last[0], lat: last[1] })
        }
      }
      const t = row.departure_time
      setDepartureTime(typeof t === 'string' && t.length >= 5 ? t.slice(0, 5) : '07:30')
      setDepartureDate(row.first_departure_date ?? '')
      const days = row.custom_days
      setCustomDays(Array.isArray(days) && days.length > 0 ? [...days] : [1, 2, 3, 4, 5])
      if (row.vehicle_type) setVehicleType(row.vehicle_type)
      if (row.gas_price_php_per_l != null) setGasPrice(Number(row.gas_price_php_per_l))
      if (row.seats_available != null) setSeats(row.seats_available)
      setPassengerNote(row.passenger_note ?? '')
      setOverrideFare(row.override_fare_php != null ? String(row.override_fare_php) : '')
    })()
    return () => {
      cancelled = true
    }
  }, [editParam])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lng: pos.coords.longitude, lat: pos.coords.latitude })
      },
      () => {
        // Ignore (permission denied / unavailable); keep Metro Manila bias.
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  // Auto-pick the weekday that matches the selected first date.
  useEffect(() => {
    if (!departureDate) return
    if (skipNextDepartureDayAuto.current) {
      skipNextDepartureDayAuto.current = false
      return
    }
    const d = new Date(`${departureDate}T00:00:00`)
    if (Number.isNaN(d.getTime())) return
    setCustomDays([d.getDay()])
  }, [departureDate])

  useEffect(() => {
    if (!origin || !destination) {
      setRouteGeoJson(null)
      setDistanceKm(0)
      setDurationHours(0)
      return
    }
    void fetchRoute(origin, destination)
  }, [origin, destination, fetchRoute])

  const mapRouteGeoJson: GeoJSON.LineString | null =
    routeGeoJson ??
    (origin && destination
      ? {
          type: 'LineString',
          coordinates: [
            [origin.lng, origin.lat],
            [destination.lng, destination.lat],
          ],
        }
      : null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    if (!origin || !destination) { setSaveError('Set your start and end location.'); return }
    if (!departureDate) { setSaveError('Pick a departure date.'); return }
    if (overrideError) return

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/sign-in'); return }

    const payload = {
      status: 'active' as const,
      frequency: 'custom' as const,
      custom_days: customDays,
      departure_time: departureTime,
      first_departure_date: departureDate,
      passenger_note: passengerNote || null,
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
      fare_formula_version: 'v2',
    }

    const { error } = editingRouteId
      ? await supabase.from('driver_routes').update(payload).eq('id', editingRouteId)
      : await supabase.from('driver_routes').insert({
          driver_id: user.id,
          ...payload,
        })
    setSaving(false)

    if (error) { setSaveError(error.message); return }
    router.push(editingRouteId ? '/profile' : '/requests')
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">{editingRouteId ? 'Edit ride' : 'Post a Ride'}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {editingRouteId
            ? 'Update route, schedule, or fare — then save changes.'
            : 'Search start and end, then set your schedule.'}
        </p>
      </div>

      <div className="space-y-3">
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
            bias={userLoc ?? SEARCH_BIAS}
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
            bias={userLoc ?? SEARCH_BIAS}
          />
        </div>

        {routeLoading && (
          <p className="text-xs text-emerald-700 animate-pulse">Getting route…</p>
        )}

        <RouteMap
          origin={origin}
          destination={destination}
          routeGeoJson={mapRouteGeoJson}
          initialCenter={userLoc}
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
          <div className="grid grid-cols-7 gap-2">
            {([
              { n: 1, label: 'Mon' },
              { n: 2, label: 'Tue' },
              { n: 3, label: 'Wed' },
              { n: 4, label: 'Thu' },
              { n: 5, label: 'Fri' },
              { n: 6, label: 'Sat' },
              { n: 0, label: 'Sun' },
            ] as const).map((d) => {
              const active = customDays.includes(d.n)
              return (
                <button
                  key={d.n}
                  type="button"
                  onClick={() =>
                    setCustomDays((prev) => {
                      const next = prev.includes(d.n)
                        ? prev.filter((x) => x !== d.n)
                        : [...prev, d.n]
                      next.sort((a, b) => a - b)
                      return next
                    })
                  }
                  className={`h-10 w-full rounded-xl border text-xs font-semibold transition-colors ${
                    active
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          {customDays.length === 0 && (
            <p className="mt-2 text-xs text-red-600">Pick at least one day.</p>
          )}
        </div>

        <hr className="border-gray-100" />

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

        <Input
          label="Current gas price (₱/L)"
          type="number"
          min={50}
          step={0.5}
          value={gasPrice}
          onChange={e => setGasPrice(parseFloat(e.target.value) || 62)}
        />

        {!fareBreakdown && (
          <p className="text-xs text-gray-500">
            Set start and end location to see the fare breakdown.
          </p>
        )}
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
              <span>Suggested fare (per passenger)</span><span>{formatPHP(fareBreakdown.roundedPerSeatPHP)}</span>
            </div>
          </div>
        )}

        <Input
          label="Override fare (₱) — optional"
          type="number"
          min={0}
          step={5}
          placeholder={computedFare > 0 ? `Suggested: ₱${computedFare}` : 'e.g. 150'}
          value={overrideFare}
          onChange={e => setOverrideFare(e.target.value)}
          hint="Leave blank to use the suggested fare. Set to 0 for a free ride."
          error={overrideError}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Note to passengers (optional)</label>
          <textarea
            value={passengerNote}
            onChange={(e) => setPassengerNote(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="e.g. Working in BGC everyday · Meet-up point details · Toll sharing"
          />
          <p className="text-xs text-gray-500">Shown to passengers when they view your ride.</p>
        </div>

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
          {editingRouteId ? 'Save changes' : 'Publish Ride'}
        </Button>
      </form>
    </div>
  )
}
