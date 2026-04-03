'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Armchair, MapPin, MoreVertical, Pencil, Route, Share2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  cn,
  formatPHP,
  formatTripRouteLine,
  placeCityFromLabel,
  placeTitleFromLabel,
} from '@/lib/utils'
import type { DriverRoute, RideBooking, UserProfile } from '@/types/database'

type DriverRouteRow = DriverRoute

type BookingRow = RideBooking & {
  driver_routes: Pick<
    DriverRoute,
    | 'id'
    | 'origin_label'
    | 'destination_label'
    | 'departure_time'
    | 'first_departure_date'
    | 'status'
    | 'override_fare_php'
    | 'computed_fare_php'
    | 'distance_km'
    | 'duration_hours'
    | 'driver_id'
  > | null
}

type TripRole = 'driver' | 'passenger'
type TripTab = 'active' | 'past'

interface ProfileTrip {
  key: string
  role: TripRole
  from: string
  to: string
  whenLabel: string
  sortKey: number
  fareLabel: string | null
  statusLabel: string
  tripStatus: string
  driverRouteId: string | null
  bookingId: string | null
  distanceKm: number | null
  durationHours: number | null
}

function parseTime(t: string | null | undefined): string {
  if (!t) return '00:00'
  const m = String(t).match(/^(\d{2}:\d{2})/)
  return m ? m[1] : '00:00'
}

function scheduleLabel(dateStr: string, timeStr: string | null | undefined): string {
  const iso = `${dateStr}T${parseTime(timeStr)}:00`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function driverRouteFare(dr: Pick<DriverRoute, 'override_fare_php' | 'computed_fare_php'>): number | null {
  if (dr.override_fare_php != null) {
    const n = Number(dr.override_fare_php)
    if (!Number.isNaN(n)) return n
  }
  if (dr.computed_fare_php != null) {
    const n = Number(dr.computed_fare_php)
    if (!Number.isNaN(n)) return n
  }
  return null
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function buildTrips(routes: DriverRouteRow[], bookings: BookingRow[]): { active: ProfileTrip[]; past: ProfileTrip[] } {
  const active: ProfileTrip[] = []
  const past: ProfileTrip[] = []

  for (const r of routes) {
    const from = r.origin_label ?? 'Start'
    const to = r.destination_label ?? 'End'
    const when = scheduleLabel(r.first_departure_date, r.departure_time)
    const sortKey = new Date(`${r.first_departure_date}T${parseTime(r.departure_time)}:00`).getTime()
    const fare = driverRouteFare(r)
    const fareLabel = fare != null && !Number.isNaN(fare) ? `${formatPHP(fare)} / passenger` : null
    const statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1)
    const trip: ProfileTrip = {
      key: `driver-${r.id}`,
      role: 'driver',
      from,
      to,
      whenLabel: when,
      sortKey: Number.isNaN(sortKey) ? 0 : sortKey,
      fareLabel,
      statusLabel,
      tripStatus: r.status,
      driverRouteId: r.id,
      bookingId: null,
      distanceKm: numOrNull(r.distance_km),
      durationHours: numOrNull(r.duration_hours),
    }
    if (r.status === 'completed' || r.status === 'cancelled') past.push(trip)
    else active.push(trip)
  }

  for (const b of bookings) {
    const dr = b.driver_routes
    const from = b.pickup_label || dr?.origin_label || 'Pickup'
    const to = b.dropoff_label || dr?.destination_label || 'Drop-off'
    const when = dr
      ? scheduleLabel(dr.first_departure_date, dr.departure_time)
      : new Date(b.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    const sortKey = dr
      ? new Date(`${dr.first_departure_date}T${parseTime(dr.departure_time)}:00`).getTime()
      : new Date(b.created_at).getTime()
    const fare = Number(b.agreed_fare_php)
    const fareLabel = Number.isNaN(fare) ? null : `${formatPHP(fare)} booked`
    const st = b.status
    const statusLabel = st.charAt(0).toUpperCase() + st.slice(1).replace('_', ' ')
    const trip: ProfileTrip = {
      key: `passenger-${b.id}`,
      role: 'passenger',
      from,
      to,
      whenLabel: when,
      sortKey: Number.isNaN(sortKey) ? 0 : sortKey,
      fareLabel,
      statusLabel,
      tripStatus: st,
      driverRouteId: dr?.id ?? null,
      bookingId: b.id,
      distanceKm: dr ? numOrNull(dr.distance_km) : null,
      durationHours: dr ? numOrNull(dr.duration_hours) : null,
    }
    if (st === 'completed' || st === 'cancelled' || st === 'disputed') past.push(trip)
    else active.push(trip)
  }

  const sortDesc = (a: ProfileTrip, b: ProfileTrip) => b.sortKey - a.sortKey
  active.sort(sortDesc)
  past.sort(sortDesc)
  return { active, past }
}

function SteeringWheelIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.75" />
      <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
    </svg>
  )
}

function PinPlace({ label }: { label: string }) {
  const title = placeTitleFromLabel(label)
  const city = placeCityFromLabel(label)
  const showCity = city && city.toLowerCase() !== title.toLowerCase()
  return (
    <div className="flex min-w-0 items-start gap-2" title={label}>
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-gray-900">{title}</p>
        {showCity ? <p className="mt-0.5 truncate text-xs text-gray-500">{city}</p> : null}
      </div>
    </div>
  )
}

function TripCard({
  trip,
  menuOpen,
  onMenuOpen,
  onMenuClose,
  onMutate,
}: {
  trip: ProfileTrip
  menuOpen: boolean
  onMenuOpen: () => void
  onMenuClose: () => void
  onMutate: () => Promise<void>
}) {
  const router = useRouter()
  const rootRef = useRef<HTMLLIElement>(null)
  const routeMeta = formatTripRouteLine(trip.distanceKm, trip.durationHours)

  useEffect(() => {
    if (!menuOpen) return
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onMenuClose()
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [menuOpen, onMenuClose])

  async function handleShare() {
    onMenuClose()
    const fmt = (raw: string) => {
      const t = placeTitleFromLabel(raw)
      const c = placeCityFromLabel(raw)
      return c && c.toLowerCase() !== t.toLowerCase() ? `${t}, ${c}` : t
    }
    const lines = [`${fmt(trip.from)} → ${fmt(trip.to)}`, trip.whenLabel, trip.fareLabel].filter(Boolean).join('\n')
    const url = typeof window !== 'undefined' ? `${window.location.origin}/find-ride` : ''
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Sabay trip', text: lines, url })
      } else {
        await navigator.clipboard.writeText(`${lines}\n${url}`)
      }
    } catch {
      /* share cancelled */
    }
  }

  async function handleEdit() {
    onMenuClose()
    if (trip.role === 'driver' && trip.driverRouteId) {
      router.push(`/post-ride?edit=${trip.driverRouteId}`)
      return
    }
    router.push('/requests')
  }

  async function handleDelete() {
    onMenuClose()
    if (!window.confirm('Remove this trip from your profile?')) return
    const sb = createClient()
    if (trip.role === 'driver' && trip.driverRouteId) {
      const st = trip.tripStatus
      if (st === 'active' || st === 'draft') {
        const { error } = await sb.from('driver_routes').update({ status: 'cancelled' }).eq('id', trip.driverRouteId)
        if (error) {
          window.alert(error.message)
          return
        }
      } else {
        const { error } = await sb.from('driver_routes').delete().eq('id', trip.driverRouteId)
        if (error) {
          window.alert("Couldn't remove this ride. It may still be linked to bookings.")
          return
        }
      }
    } else if (trip.role === 'passenger' && trip.bookingId) {
      if (trip.tripStatus === 'completed' || trip.tripStatus === 'cancelled') {
        window.alert('This booking is already finished or cancelled.')
        return
      }
      const { error } = await sb.from('ride_bookings').update({ status: 'cancelled' }).eq('id', trip.bookingId)
      if (error) {
        window.alert(error.message)
        return
      }
    }
    await onMutate()
  }

  return (
    <li ref={rootRef} className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={
              trip.role === 'driver'
                ? 'inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100'
                : 'inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-100'
            }
          >
            {trip.role === 'driver' ? 'Driver' : 'Passenger'}
          </span>
          <span className="text-xs text-gray-500">{trip.statusLabel}</span>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => (menuOpen ? onMenuClose() : onMenuOpen())}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Trip actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MoreVertical className="h-5 w-5" strokeWidth={2} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg ring-1 ring-black/5"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleEdit}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleDelete}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
                Delete
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleShare}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Share2 className="h-4 w-4 shrink-0" strokeWidth={2} />
                Share
              </button>
            </div>
          )}
        </div>
      </div>

      {routeMeta && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <Route className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
          <span className="font-medium text-gray-700">Route</span>
          <span className="truncate">{routeMeta}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <PinPlace label={trip.from} />
        </div>
        <span
          className="flex h-8 shrink-0 items-center justify-center self-center text-base font-medium text-gray-400 sm:h-auto sm:self-center"
          aria-hidden
        >
          <span className="sm:hidden">↓</span>
          <span className="hidden sm:inline">→</span>
        </span>
        <div className="min-w-0 flex-1">
          <PinPlace label={trip.to} />
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-600">{trip.whenLabel}</p>
      {trip.fareLabel && <p className="mt-1 text-sm font-medium text-gray-800">{trip.fareLabel}</p>}
    </li>
  )
}

function TripList({
  trips,
  emptyLabel,
  onMutate,
}: {
  trips: ProfileTrip[]
  emptyLabel: string
  onMutate: () => Promise<void>
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  if (trips.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-sm text-gray-500">
        {emptyLabel}
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {trips.map(t => (
        <TripCard
          key={t.key}
          trip={t}
          menuOpen={openKey === t.key}
          onMenuOpen={() => setOpenKey(t.key)}
          onMenuClose={() => setOpenKey(null)}
          onMutate={onMutate}
        />
      ))}
    </ul>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [driverRoutes, setDriverRoutes] = useState<DriverRouteRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [tripTab, setTripTab] = useState<TripTab>('active')
  const [loading, setLoading] = useState(true)

  const { active: activeTrips, past: pastTrips } = useMemo(
    () => buildTrips(driverRoutes, bookings),
    [driverRoutes, bookings],
  )

  const refreshTrips = useCallback(async () => {
    const sb = createClient()
    const { data: auth } = await sb.auth.getUser()
    const user = auth?.user
    if (!user) return
    const [routesRes, bookingsRes] = await Promise.all([
      sb
        .from('driver_routes')
        .select('*')
        .eq('driver_id', user.id)
        .order('first_departure_date', { ascending: false }),
      sb
        .from('ride_bookings')
        .select(
          `
          *,
          driver_routes (
            id,
            origin_label,
            destination_label,
            departure_time,
            first_departure_date,
            status,
            override_fare_php,
            computed_fare_php,
            distance_km,
            duration_hours,
            driver_id
          )
        `,
        )
        .eq('passenger_id', user.id)
        .order('created_at', { ascending: false }),
    ])
    setDriverRoutes((routesRes.data as DriverRouteRow[]) ?? [])
    setBookings((bookingsRes.data as BookingRow[]) ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    const sb = createClient()
    ;(async () => {
      const { data: auth } = await sb.auth.getUser()
      const user = auth?.user
      if (!user) {
        router.push('/sign-in')
        return
      }
      const [profileRes, routesRes, bookingsRes] = await Promise.all([
        sb.from('users').select('*').eq('id', user.id).single(),
        sb
          .from('driver_routes')
          .select('*')
          .eq('driver_id', user.id)
          .order('first_departure_date', { ascending: false }),
        sb
          .from('ride_bookings')
          .select(
            `
            *,
            driver_routes (
              id,
              origin_label,
              destination_label,
              departure_time,
              first_departure_date,
              status,
              override_fare_php,
              computed_fare_php,
              distance_km,
              duration_hours,
              driver_id
            )
          `,
          )
          .eq('passenger_id', user.id)
          .order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      setAuthUser(user)
      const row = profileRes.data as UserProfile | null
      if (row) setProfile(row)
      setDriverRoutes((routesRes.data as DriverRouteRow[]) ?? [])
      setBookings((bookingsRes.data as BookingRow[]) ?? [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  if (loading) return <div className="py-20 text-center text-sm text-gray-400 animate-pulse">Loading…</div>

  const email = authUser?.email ?? ''
  const emailLocal = email.split('@')[0] ?? ''
  const meta = (authUser?.user_metadata ?? {}) as Record<string, string | undefined>
  const displayName = profile?.display_name?.trim() ?? ''
  const usernameHandle = profile?.username?.trim().replace(/^@+/, '') ?? ''
  const avatarSrc =
    profile?.avatar_url?.trim() ||
    meta.avatar_url ||
    meta.picture ||
    meta.avatar ||
    ''
  const initialsSrc = (displayName || emailLocal || '?').trim()
  const initials = initialsSrc.slice(0, 2).toUpperCase()
  const handleShow = (usernameHandle || emailLocal || 'you').trim()
  const driverRating = profile?.driver_rating_avg
  const passengerRating = profile?.passenger_rating_avg
  const driverScore =
    driverRating != null && !Number.isNaN(Number(driverRating)) ? Number(driverRating).toFixed(1) : null
  const passengerScore =
    passengerRating != null && !Number.isNaN(Number(passengerRating)) ? Number(passengerRating).toFixed(1) : null

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-row items-start gap-4 rounded-2xl border border-gray-100 bg-white p-6">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-gray-100 to-gray-200 ring-2 ring-gray-100 sm:h-24 sm:w-24">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-bold text-gray-500 sm:text-2xl">{initials}</div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-left">
          <h2 className="truncate text-lg font-bold text-gray-900 sm:text-xl">{displayName || 'Your name'}</h2>
          <p className="truncate text-sm text-gray-600">@{handleShow}</p>
          <p className="truncate text-sm text-gray-500">{email || '—'}</p>
          <div className="space-y-1 pt-1 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <SteeringWheelIcon className="h-4 w-4 shrink-0 text-yellow-500" />
              <span className="min-w-0 truncate">
                {driverScore != null ? (
                  <>
                    <span className="font-semibold text-yellow-600">{driverScore}</span>
                    <span className="text-gray-500"> driver</span>
                  </>
                ) : (
                  <span className="text-gray-500">No driver ratings yet</span>
                )}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Armchair
                className="h-4 w-4 shrink-0 text-yellow-500"
                strokeWidth={2}
                aria-hidden
              />
              <span className="min-w-0 truncate">
                {passengerScore != null ? (
                  <>
                    <span className="font-semibold text-yellow-600">{passengerScore}</span>
                    <span className="text-gray-500"> passenger</span>
                  </>
                ) : (
                  <span className="text-gray-500">No passenger ratings yet</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <div role="tablist" aria-label="Trips" className="flex gap-0 border-b border-gray-200">
          <button
            type="button"
            role="tab"
            aria-selected={tripTab === 'active'}
            onClick={() => setTripTab('active')}
            className={cn(
              'relative flex-1 pb-3 text-center text-sm font-semibold transition-colors',
              tripTab === 'active' ? 'text-emerald-700' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Active
            {tripTab === 'active' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-emerald-600" aria-hidden />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tripTab === 'past'}
            onClick={() => setTripTab('past')}
            className={cn(
              'relative flex-1 pb-3 text-center text-sm font-semibold transition-colors',
              tripTab === 'past' ? 'text-emerald-700' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Past
            {tripTab === 'past' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-emerald-600" aria-hidden />
            )}
          </button>
        </div>
        <div role="tabpanel" className="pt-4">
          {tripTab === 'active' ? (
            <TripList trips={activeTrips} emptyLabel="No active trips yet." onMutate={refreshTrips} />
          ) : (
            <TripList trips={pastTrips} emptyLabel="No past trips yet." onMutate={refreshTrips} />
          )}
        </div>
      </div>
    </div>
  )
}
