import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  const { requestId, action, driverNote } = await req.json()
  if (!requestId || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify caller is the driver for this request
  const { data: rsr } = await supabase
    .from('ride_stop_requests')
    .select('id, driver_route_id, passenger_id, pickup_geom, dropoff_geom, pickup_label, dropoff_label, driver_routes!inner(driver_id, computed_fare_php, override_fare_php)')
    .eq('id', requestId)
    .single()

  if (!rsr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  type RsrRow = typeof rsr & {
    driver_routes: { driver_id: string; computed_fare_php: number | null; override_fare_php: number | null }
  }
  const row = rsr as RsrRow

  if (row.driver_routes.driver_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: updateErr } = await supabase
    .from('ride_stop_requests')
    .update({ status: action, driver_note: driverNote ?? null, decided_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // If approved — create booking
  if (action === 'approved') {
    const fare = row.driver_routes.override_fare_php ?? row.driver_routes.computed_fare_php ?? 0
    const { error: bookErr } = await supabase.from('ride_bookings').insert({
      driver_route_id: row.driver_route_id,
      passenger_id: row.passenger_id,
      linked_request_id: requestId,
      pickup_geom: row.pickup_geom,
      dropoff_geom: row.dropoff_geom,
      pickup_label: row.pickup_label,
      dropoff_label: row.dropoff_label,
      agreed_fare_php: fare,
    })
    if (bookErr) return NextResponse.json({ error: bookErr.message }, { status: 500 })

    // Decrement seats_available
    await supabase.rpc('decrement_seats', { route_id: row.driver_route_id })
  }

  return NextResponse.json({ ok: true })
}
