import { NextRequest, NextResponse } from 'next/server'
import { amazonLocationForwardHeaders } from '@/lib/aws-location-forward-headers'

/**
 * Amazon Location Places V2 — GetPlace by PlaceId (coordinates + label).
 * @see https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_GetPlace.html
 */
export async function GET(req: NextRequest) {
  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim()
  const apiKey = process.env.NEXT_PUBLIC_AWS_LOCATION_API_KEY?.trim()
  const placeId = req.nextUrl.searchParams.get('placeId')?.trim()

  if (!region || !apiKey) {
    return NextResponse.json(
      { error: 'Places API not configured' },
      { status: 500 }
    )
  }

  if (!placeId) {
    return NextResponse.json({ error: 'Missing placeId' }, { status: 400 })
  }

  const pathId = encodeURIComponent(placeId)
  const url =
    `https://places.geo.${region}.amazonaws.com/v2/place/${pathId}` +
    `?key=${encodeURIComponent(apiKey)}&language=en`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: amazonLocationForwardHeaders(req),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: 'GetPlace failed', detail: text.slice(0, 200) },
        { status: res.status }
      )
    }

    const data = (await res.json()) as {
      Position?: [number, number]
      Address?: { Label?: string }
    }

    const pos = data.Position
    if (!pos || pos.length < 2) {
      return NextResponse.json({ error: 'No position in response' }, { status: 422 })
    }

    const [lng, lat] = pos
    const label = data.Address?.Label ?? ''

    return NextResponse.json({ lat, lng, label: label || `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
