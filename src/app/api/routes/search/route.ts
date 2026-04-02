import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const oLat = parseFloat(searchParams.get('oLat') ?? '')
  const oLng = parseFloat(searchParams.get('oLng') ?? '')
  const dLat = parseFloat(searchParams.get('dLat') ?? '')
  const dLng = parseFloat(searchParams.get('dLng') ?? '')
  const radius = parseFloat(searchParams.get('radius') ?? '1000')
  const date = searchParams.get('date') ?? ''

  if ([oLat, oLng, dLat, dLng].some(isNaN)) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 })
  }

  const supabase = await createClient()

  // PostGIS: both passenger origin AND destination must be within `radius` metres of the route
  // We also check pickup fraction < dropoff fraction server-side for accepted matches
  const { data, error } = await supabase.rpc('search_matching_routes', {
    p_olat: oLat, p_olng: oLng,
    p_dlat: dLat, p_dlng: dLng,
    p_radius: radius,
    p_date: date || null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ routes: data ?? [] })
}
