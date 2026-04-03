'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPHP, formatManilaDateTime, formatRouteOfferScheduleSummary } from '@/lib/utils'
import Button from '@/components/ui/Button'
import type { RideStopRequest, RideBooking, DriverRoute } from '@/types/database'

type Tab = 'driver' | 'passenger'

interface DriverRequest extends Omit<RideStopRequest, 'passenger' | 'driver_route'> {
  driver_route?: Pick<
    DriverRoute,
    | 'id'
    | 'origin_label'
    | 'destination_label'
    | 'departure_time'
    | 'first_departure_date'
    | 'frequency'
    | 'custom_days'
    | 'driver_id'
  >
  passenger?: { display_name: string | null }
}

interface PassengerRequest extends Omit<RideStopRequest, 'driver_route'> {
  driver_route?: Pick<
    DriverRoute,
    | 'id'
    | 'origin_label'
    | 'destination_label'
    | 'departure_time'
    | 'first_departure_date'
    | 'frequency'
    | 'custom_days'
  > & { driver?: { display_name: string | null } }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50 border-amber-200',
  approved: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  rejected: 'text-red-500 bg-red-50 border-red-200',
  cancelled: 'text-gray-400 bg-gray-50 border-gray-200',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'New request',
  approved: 'Approved',
  rejected: 'Declined',
  cancelled: 'Cancelled',
}

function RequestStatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.pending
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${colors}`}>
      {label}
    </span>
  )
}

function RequestPickupDropoffBlock({
  pickupLabel,
  dropoffLabel,
}: {
  pickupLabel: string
  dropoffLabel: string
}) {
  return (
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
          <span className="block mt-1">{pickupLabel}</span>
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
          <span className="block mt-1">{dropoffLabel}</span>
        </span>
      </p>
    </div>
  )
}

function RequestTimingLines({
  createdAt,
  decidedAt,
  driverRoute,
}: {
  createdAt: string
  decidedAt: string | null
  driverRoute?: Parameters<typeof formatRouteOfferScheduleSummary>[0] | null
}) {
  const schedule =
    driverRoute &&
    formatRouteOfferScheduleSummary({
      first_departure_date: driverRoute.first_departure_date,
      departure_time: driverRoute.departure_time,
      frequency: driverRoute.frequency,
      custom_days: driverRoute.custom_days,
    })

  return (
    <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-2 mt-1">
      <p>
        <span className="font-semibold text-gray-600">Requested</span>{' '}
        <span className="text-gray-500">{formatManilaDateTime(createdAt)}</span>
      </p>
      {decidedAt && (
        <p>
          <span className="font-semibold text-gray-600">Updated</span>{' '}
          <span className="text-gray-500">{formatManilaDateTime(decidedAt)}</span>
        </p>
      )}
      {schedule && schedule !== '—' && (
        <p>
          <span className="font-semibold text-gray-600">Ride offered</span>{' '}
          <span className="text-gray-500">{schedule}</span>
        </p>
      )}
    </div>
  )
}

export default function RequestsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('driver')
  const [userId, setUserId] = useState<string | null>(null)

  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([])
  const [passengerRequests, setPassengerRequests] = useState<PassengerRequest[]>([])
  const [bookings, setBookings] = useState<RideBooking[]>([])
  const [loading, setLoading] = useState(true)

  const [deciding, setDeciding] = useState<string | null>(null)

  const loadAll = useCallback(
    async (uid: string) => {
      setLoading(true)
      const routeFields =
        'id, origin_label, destination_label, departure_time, first_departure_date, frequency, custom_days'
      const [drRes, prRes, bRes] = await Promise.all([
        supabase
          .from('ride_stop_requests')
          .select(
            `*, driver_routes!inner(${routeFields}, driver_id), passenger:users!passenger_id(display_name)`,
          )
          .eq('driver_routes.driver_id', uid)
          .neq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('ride_stop_requests')
          .select(`*, driver_routes(${routeFields}, driver:users!driver_id(display_name))`)
          .eq('passenger_id', uid)
          .neq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('ride_bookings')
          .select('*')
          .or(`passenger_id.eq.${uid}`)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      setDriverRequests((drRes.data as DriverRequest[]) ?? [])
      setPassengerRequests((prRes.data as PassengerRequest[]) ?? [])
      setBookings((bRes.data as RideBooking[]) ?? [])
      setLoading(false)
    },
    [supabase],
  )

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/sign-in')
        return
      }
      setUserId(user.id)
      void loadAll(user.id)
    })
  }, [loadAll, router, supabase.auth])

  async function decide(requestId: string, action: 'approved' | 'rejected') {
    setDeciding(requestId)
    const res = await fetch('/api/requests', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, action }),
    })
    setDeciding(null)
    if (res.ok && userId) loadAll(userId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-gray-400 animate-pulse">Loading requests…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Requests</h1>
        <p className="text-sm text-gray-500 mt-1">
          Approve or decline pick-up requests. Open <strong>Inbox</strong> to message passengers on confirmed
          trips.
        </p>
      </div>

      <div className="flex border-b border-gray-200">
        {(['driver', 'passenger'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-semibold capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-emerald-600 text-emerald-600'
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            {t === 'driver' ? `Driver (${driverRequests.filter(r => r.status === 'pending').length})` : 'My Requests'}
          </button>
        ))}
      </div>

      {tab === 'driver' && (
        <div className="space-y-4">
          {driverRequests.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No incoming requests yet.</p>
          )}
          {driverRequests.map(req => (
            <div
              key={req.id}
              className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 transition-all"
            >
              <div className="flex justify-start">
                <RequestStatusBadge status={req.status} />
              </div>
              <div className="space-y-2 w-full">
                <RequestPickupDropoffBlock
                  pickupLabel={req.pickup_label ?? 'Custom pickup'}
                  dropoffLabel={req.dropoff_label ?? 'Custom drop-off'}
                />
                <p className="text-xs text-gray-500">
                  Passenger:{' '}
                  <span className="text-gray-700 font-medium">
                    {(req as DriverRequest).passenger?.display_name ?? 'A passenger'}
                  </span>
                </p>
                <RequestTimingLines
                  createdAt={req.created_at}
                  decidedAt={req.decided_at}
                  driverRoute={req.driver_route}
                />
              </div>

              {req.passenger_note && (
                <p className="text-xs text-gray-400 italic bg-gray-50 px-3 py-2 rounded-lg">
                  &ldquo;{req.passenger_note}&rdquo;
                </p>
              )}

              {req.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    loading={deciding === req.id}
                    onClick={() => decide(req.id, 'approved')}
                  >
                    <CheckCircle size={14} className="mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    className="flex-1"
                    loading={deciding === req.id}
                    onClick={() => decide(req.id, 'rejected')}
                  >
                    <XCircle size={14} className="mr-1" /> Decline
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'passenger' && (
        <div className="space-y-4">
          {passengerRequests.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No requests sent yet.</p>
          )}
          {passengerRequests.map(req => {
            const pr = req as PassengerRequest
            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 transition-all"
              >
                <div className="flex justify-start">
                  <RequestStatusBadge status={req.status} />
                </div>
                <div className="space-y-2 w-full">
                  <RequestPickupDropoffBlock
                    pickupLabel={req.pickup_label ?? 'Custom pickup'}
                    dropoffLabel={req.dropoff_label ?? 'Custom drop-off'}
                  />
                  <p className="text-xs text-gray-500">
                    Driver:{' '}
                    <span className="text-gray-700 font-medium">
                      {pr.driver_route?.driver?.display_name ?? 'Unknown'}
                    </span>
                  </p>
                  <RequestTimingLines
                    createdAt={req.created_at}
                    decidedAt={req.decided_at}
                    driverRoute={pr.driver_route}
                  />
                </div>
                {req.driver_note && (
                  <p className="text-xs text-gray-400 italic bg-gray-50 px-3 py-2 rounded-lg">
                    Driver note: &ldquo;{req.driver_note}&rdquo;
                  </p>
                )}
              </div>
            )
          })}

          {bookings.length > 0 && (
            <>
              <p className="text-sm font-semibold text-gray-700 pt-2">Confirmed Bookings</p>
              {bookings.map(b => (
                <div key={b.id} className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-semibold text-emerald-800">Booking confirmed</p>
                    <span className="text-sm font-bold text-emerald-700 shrink-0">{formatPHP(b.agreed_fare_php)}</span>
                  </div>
                  <p className="text-xs text-emerald-600">{b.pickup_label} → {b.dropoff_label}</p>
                  <p className="text-xs text-emerald-500 uppercase tracking-wide">{b.status}</p>
                  <Link
                    href={`/inbox/${b.driver_route_id}`}
                    className="inline-flex text-xs font-semibold text-emerald-800 hover:text-emerald-900 underline-offset-2 hover:underline"
                  >
                    Open trip chat
                  </Link>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
