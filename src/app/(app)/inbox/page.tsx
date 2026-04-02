'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Clock, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPHP } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { RideStopRequest, RideBooking, DriverRoute } from '@/types/database'

type Tab = 'driver' | 'passenger'

interface DriverRequest extends Omit<RideStopRequest, 'passenger'> {
  driver_route?: DriverRoute
  passenger?: { display_name: string | null }
}

interface PassengerRequest extends Omit<RideStopRequest, 'driver_route'> {
  driver_route?: DriverRoute & { driver?: { display_name: string | null } }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50 border-amber-200',
  approved: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  rejected: 'text-red-500 bg-red-50 border-red-200',
  cancelled: 'text-gray-400 bg-gray-50 border-gray-200',
}

export default function InboxPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('driver')
  const [userId, setUserId] = useState<string | null>(null)

  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([])
  const [passengerRequests, setPassengerRequests] = useState<PassengerRequest[]>([])
  const [bookings, setBookings] = useState<RideBooking[]>([])
  const [loading, setLoading] = useState(true)

  const [deciding, setDeciding] = useState<string | null>(null)
  const [driverNote, setDriverNote] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/sign-in'); return }
      setUserId(user.id)
      loadAll(user.id)
    })
  }, [])

  async function loadAll(uid: string) {
    setLoading(true)
    const [drRes, prRes, bRes] = await Promise.all([
      // Requests where I am the driver
      supabase
        .from('ride_stop_requests')
        .select('*, driver_routes!inner(id, origin_label, destination_label, departure_time, driver_id), passenger:users!passenger_id(display_name)')
        .eq('driver_routes.driver_id', uid)
        .order('created_at', { ascending: false })
        .limit(30),
      // Requests I sent as passenger
      supabase
        .from('ride_stop_requests')
        .select('*, driver_routes(id, origin_label, destination_label, departure_time, driver:users!driver_id(display_name))')
        .eq('passenger_id', uid)
        .order('created_at', { ascending: false })
        .limit(30),
      // My confirmed bookings
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
  }

  async function decide(requestId: string, action: 'approved' | 'rejected') {
    setDeciding(requestId)
    const res = await fetch('/api/requests', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, action, driverNote: driverNote[requestId] }),
    })
    setDeciding(null)
    if (res.ok && userId) loadAll(userId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-gray-400 animate-pulse">Loading inbox…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <h1 className="text-2xl font-extrabold text-gray-900">Inbox</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['driver', 'passenger'] as Tab[]).map(t => (
          <button
            key={t}
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

      {/* Driver tab — incoming requests */}
      {tab === 'driver' && (
        <div className="space-y-4">
          {driverRequests.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No incoming requests yet.</p>
          )}
          {driverRequests.map(req => (
            <div key={req.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    {(req as DriverRequest).passenger?.display_name ?? 'A passenger'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {req.driver_route?.origin_label} → {req.driver_route?.destination_label}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[req.status]}`}>
                  {req.status}
                </span>
              </div>

              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin size={11} className="text-blue-500" />
                  {req.pickup_label ?? 'Custom pickup'}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={11} className="text-purple-500" />
                  {req.dropoff_label ?? 'Custom drop-off'}
                </span>
              </div>

              {req.passenger_note && (
                <p className="text-xs text-gray-400 italic bg-gray-50 px-3 py-2 rounded-lg">
                  "{req.passenger_note}"
                </p>
              )}

              {req.status === 'pending' && (
                <div className="space-y-2 pt-1">
                  <Input
                    placeholder="Note to passenger (optional)"
                    value={driverNote[req.id] ?? ''}
                    onChange={e => setDriverNote(prev => ({ ...prev, [req.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Passenger tab — my sent requests */}
      {tab === 'passenger' && (
        <div className="space-y-4">
          {passengerRequests.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No requests sent yet.</p>
          )}
          {passengerRequests.map(req => {
            const pr = req as PassengerRequest
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      Driver: {pr.driver_route?.driver?.display_name ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {pr.driver_route?.origin_label} → {pr.driver_route?.destination_label}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[req.status]}`}>
                    {req.status}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <MapPin size={11} className="text-blue-500" />
                    {req.pickup_label ?? 'Custom pickup'}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={11} className="text-purple-500" />
                    {req.dropoff_label ?? 'Custom drop-off'}
                  </span>
                </div>
                {req.status === 'approved' && (
                  <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle size={12} /> Confirmed! Check your agreed fare with the driver.
                  </p>
                )}
                {req.driver_note && (
                  <p className="text-xs text-gray-400 italic bg-gray-50 px-3 py-2 rounded-lg">
                    Driver note: "{req.driver_note}"
                  </p>
                )}
              </div>
            )
          })}

          {/* Bookings section */}
          {bookings.length > 0 && (
            <>
              <p className="text-sm font-semibold text-gray-700 pt-2">Confirmed Bookings</p>
              {bookings.map(b => (
                <div key={b.id} className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1">
                  <div className="flex justify-between">
                    <p className="text-sm font-semibold text-emerald-800">Booking confirmed</p>
                    <span className="text-sm font-bold text-emerald-700">{formatPHP(b.agreed_fare_php)}</span>
                  </div>
                  <p className="text-xs text-emerald-600">{b.pickup_label} → {b.dropoff_label}</p>
                  <p className="text-xs text-emerald-500 uppercase tracking-wide">{b.status}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
