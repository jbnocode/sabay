import { NextRequest, NextResponse } from 'next/server'
import type { LatLng } from '@/lib/matching/geometry'

/**
 * Amazon Location Service Route Calculator — REST endpoint with API Key auth.
 *
 * Endpoint pattern:
 *   POST https://routes.geo.{region}.amazonaws.com/routes/v0/calculators/{calcName}/calculate/route?key={apiKey}
 *
 * This avoids AWS SDK credential middleware complexity; API Key is a first-class
 * auth method for Amazon Location and is appended as a query param.
 */
export async function POST(req: NextRequest) {
  const { origin, destination }: { origin: LatLng; destination: LatLng } = await req.json()

  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim()
  const calcName = process.env.NEXT_PUBLIC_AWS_LOCATION_CALCULATOR_NAME
  const apiKey = process.env.NEXT_PUBLIC_AWS_LOCATION_API_KEY

  if (!region || !calcName || !apiKey) {
    return NextResponse.json(
      {
        error:
          'Amazon Location not configured: set NEXT_PUBLIC_AWS_REGION (must match your API key region, e.g. ap-southeast-2), calculator name, and API key',
      },
      { status: 500 }
    )
  }

  const url =
    `https://routes.geo.${region}.amazonaws.com/routes/v0/calculators/${calcName}/calculate/route` +
    `?key=${encodeURIComponent(apiKey)}`

  const body = {
    DeparturePosition: [origin.lng, origin.lat],
    DestinationPosition: [destination.lng, destination.lat],
    TravelMode: 'Car',
    IncludeLegGeometry: true,
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
      Legs?: { Geometry?: { LineString?: [number, number][] } }[]
      Summary?: { Distance?: number; DurationSeconds?: number }
    } = await res.json()

    const legs = data.Legs ?? []
    if (legs.length === 0) {
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
    const distanceKm = data.Summary?.Distance ?? 0
    const durationHours = (data.Summary?.DurationSeconds ?? 0) / 3600

    return NextResponse.json({ geometry, distanceKm, durationHours })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
