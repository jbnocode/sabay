import { NextRequest, NextResponse } from 'next/server'
import type { LatLng } from '@/lib/matching/geometry'

/**
 * Amazon Location Service Routes V2 — REST endpoint with API Key auth.
 *
 * Endpoint pattern:
 *   POST https://routes.geo.{region}.amazonaws.com/v2/routes?key={apiKey}
 *
 * This avoids AWS SDK credential middleware complexity; API Key is a first-class
 * auth method for Amazon Location and is appended as a query param.
 */
export async function POST(req: NextRequest) {
  const { origin, destination }: { origin: LatLng; destination: LatLng } = await req.json()

  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim()
  const apiKey = process.env.NEXT_PUBLIC_AWS_LOCATION_API_KEY

  if (!region || !apiKey) {
    return NextResponse.json(
      {
        error:
          'Amazon Location not configured: set NEXT_PUBLIC_AWS_REGION (must match your API key region) and API key',
      },
      { status: 500 }
    )
  }

  const url =
    `https://routes.geo.${region}.amazonaws.com/v2/routes` +
    `?key=${encodeURIComponent(apiKey)}`

  const body = {
    Origin: [origin.lng, origin.lat],
    Destination: [destination.lng, destination.lat],
    TravelMode: 'Car',
    LegGeometryFormat: 'Simple',
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Amazon Location error: ${text}` }, { status: 502 })
    }

    const data: {
      Routes?: Array<{
        Legs?: Array<{
          Geometry?: { LineString?: [number, number][]; Polyline?: string }
        }>
        Summary?: { Distance?: number; Duration?: number }
      }>
    } = await res.json()

    const route = data.Routes?.[0]
    const legs = route?.Legs ?? []
    if (!route || legs.length === 0) {
      return NextResponse.json({ error: 'No route found' }, { status: 404 })
    }

    // Flatten all leg LineStrings into one continuous GeoJSON LineString
    const allCoords: [number, number][] = []
    for (const leg of legs) {
      const legCoords = leg.Geometry?.LineString ?? []
      // Skip duplicate join point between legs (index 0 of subsequent legs)
      const startIdx = allCoords.length > 0 ? 1 : 0
      for (let i = startIdx; i < legCoords.length; i++) {
        allCoords.push(legCoords[i])
      }
    }

    const geometry: GeoJSON.LineString = { type: 'LineString', coordinates: allCoords }
    // Routes v2 returns Distance in meters; UI expects kilometers.
    const distanceKm = (route.Summary?.Distance ?? 0) / 1000
    const durationHours = (route.Summary?.Duration ?? 0) / 3600

    return NextResponse.json({ geometry, distanceKm, durationHours })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
