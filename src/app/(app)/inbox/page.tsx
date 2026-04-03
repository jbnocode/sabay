'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatRouteOfferScheduleSummary, placeTitleFromLabel } from '@/lib/utils'

type Tab = 'driving' | 'riding'

interface DriverBookingRow {
  id: string
  driver_route_id: string
  status: string
  passenger?: { display_name: string | null }
  driver_routes: {
    id: string
    origin_label: string | null
    destination_label: string | null
    departure_time: string
    first_departure_date: string
    frequency: string
    custom_days: number[] | null
    driver_id: string
  }
}

interface PassengerBookingRow {
  id: string
  driver_route_id: string
  status: string
  pickup_label: string | null
  dropoff_label: string | null
  driver_routes: {
    id: string
    origin_label: string | null
    destination_label: string | null
    departure_time: string
    first_departure_date: string
    frequency: string
    custom_days: number[] | null
    driver?: { display_name: string | null }
  }
}

type DrivingThread = {
  routeId: string
  origin_label: string | null
  destination_label: string | null
  schedule: string
  passengers: { bookingId: string; name: string }[]
}

export default function InboxPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('driving')
  const [loading, setLoading] = useState(true)
  const [drivingThreads, setDrivingThreads] = useState<DrivingThread[]>([])
  const [ridingBookings, setRidingBookings] = useState<PassengerBookingRow[]>([])

  const loadThreads = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/sign-in')
      return
    }
    setLoading(true)
    const routeSelect =
      'id, origin_label, destination_label, departure_time, first_departure_date, frequency, custom_days, driver_id'

    const [driveRes, rideRes] = await Promise.all([
      supabase
        .from('ride_bookings')
        .select(
          `id, driver_route_id, status, passenger:users!passenger_id(display_name), driver_routes!inner(${routeSelect})`,
        )
        .eq('driver_routes.driver_id', user.id)
        .in('status', ['confirmed', 'in_progress'])
        .order('created_at', { ascending: false }),
      supabase
        .from('ride_bookings')
        .select(
          `id, driver_route_id, status, pickup_label, dropoff_label, driver_routes(${routeSelect}, driver:users!driver_id(display_name))`,
        )
        .eq('passenger_id', user.id)
        .in('status', ['confirmed', 'in_progress'])
        .order('created_at', { ascending: false }),
    ])

    const driveRows = (driveRes.data as unknown as DriverBookingRow[]) ?? []
    const threadMap = new Map<string, DrivingThread>()
    for (const row of driveRows) {
      const dr = Array.isArray(row.driver_routes) ? row.driver_routes[0] : row.driver_routes
      if (!dr) continue
      let t = threadMap.get(dr.id)
      if (!t) {
        t = {
          routeId: dr.id,
          origin_label: dr.origin_label,
          destination_label: dr.destination_label,
          schedule: formatRouteOfferScheduleSummary({
            first_departure_date: dr.first_departure_date,
            departure_time: dr.departure_time,
            frequency: dr.frequency,
            custom_days: dr.custom_days,
          }),
          passengers: [],
        }
        threadMap.set(dr.id, t)
      }
      const pass = Array.isArray(row.passenger) ? row.passenger[0] : row.passenger
      t.passengers.push({
        bookingId: row.id,
        name: pass?.display_name?.trim() || 'Passenger',
      })
    }
    setDrivingThreads([...threadMap.values()])
    setRidingBookings((rideRes.data as unknown as PassengerBookingRow[]) ?? [])
    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loadThreads sets state after await
    void loadThreads()
  }, [loadThreads])

  const ridingCount = ridingBookings.length
  const drivingCount = drivingThreads.length

  const emptyCopy = useMemo(
    () => ({
      driving:
        'When passengers are confirmed on your posted rides, a group thread will show up here for trip coordination.',
      riding: 'Confirmed bookings with a driver will appear here for messaging.',
    }),
    [],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-gray-400 animate-pulse">Loading inbox…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Inbox</h1>
        <p className="text-sm text-gray-500 mt-1">
          Trip chats with everyone on the same ride. Tap a card to open the conversation.
        </p>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('driving')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${
            tab === 'driving'
              ? 'border-b-2 border-emerald-600 text-emerald-600'
              : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          Driving ({drivingCount})
        </button>
        <button
          type="button"
          onClick={() => setTab('riding')}
          className={`flex-1 py-2 text-sm font-semibold transition-colors ${
            tab === 'riding'
              ? 'border-b-2 border-emerald-600 text-emerald-600'
              : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          Riding ({ridingCount})
        </button>
      </div>

      {tab === 'driving' && (
        <div className="space-y-4">
          {drivingThreads.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">{emptyCopy.driving}</p>
          ) : (
            drivingThreads.map(thread => (
              <Link
                key={thread.routeId}
                href={`/inbox/${thread.routeId}`}
                className="block bg-white rounded-2xl border border-gray-100 p-4 transition-all hover:border-emerald-200 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/35"
              >
                <div className="min-w-0 space-y-2">
                  {thread.schedule && thread.schedule !== '—' && (
                    <p className="text-base font-extrabold text-emerald-900 leading-snug tracking-tight">
                      {thread.schedule}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 leading-snug">
                    {placeTitleFromLabel(thread.origin_label)} → {placeTitleFromLabel(thread.destination_label)}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 pt-0.5">
                    <Users size={14} className="shrink-0 text-gray-400" />
                    <span>
                      {thread.passengers.map(p => p.name).join(', ')}
                      <span className="text-gray-400">
                        {' '}
                        ({thread.passengers.length} {thread.passengers.length === 1 ? 'passenger' : 'passengers'})
                      </span>
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'riding' && (
        <div className="space-y-4">
          {ridingBookings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">{emptyCopy.riding}</p>
          ) : (
            ridingBookings.map(b => {
              const dr = Array.isArray(b.driver_routes) ? b.driver_routes[0] : b.driver_routes
              const schedule =
                dr &&
                formatRouteOfferScheduleSummary({
                  first_departure_date: dr.first_departure_date,
                  departure_time: dr.departure_time,
                  frequency: dr.frequency,
                  custom_days: dr.custom_days,
                })
              if (!dr?.id) return null
              return (
                <Link
                  key={b.id}
                  href={`/inbox/${dr.id}`}
                  className="block bg-white rounded-2xl border border-gray-100 p-4 transition-all hover:border-sky-200 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35"
                >
                  <div className="min-w-0 space-y-2">
                    {schedule && schedule !== '—' && (
                      <p className="text-base font-extrabold text-sky-900 leading-snug tracking-tight">
                        {schedule}
                      </p>
                    )}
                    <p className="text-xs text-gray-500">
                      Driver:{' '}
                      <span className="font-semibold text-gray-800">
                        {dr.driver?.display_name ?? 'Your driver'}
                      </span>
                    </p>
                    <p className="text-sm text-gray-500 leading-snug">
                      {placeTitleFromLabel(dr.origin_label)} → {placeTitleFromLabel(dr.destination_label)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Your stops: {placeTitleFromLabel(b.pickup_label)} → {placeTitleFromLabel(b.dropoff_label)}
                    </p>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
