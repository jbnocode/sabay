import { NextRequest, NextResponse } from 'next/server'
import { amazonLocationForwardHeaders } from '@/lib/aws-location-forward-headers'

/**
 * Amazon Location Places V2 — Autocomplete (server-side, API key from env).
 * @see https://docs.aws.amazon.com/location/latest/APIReference/API_geoplaces_Autocomplete.html
 */
export async function POST(req: NextRequest) {
  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim()
  const apiKey = process.env.NEXT_PUBLIC_AWS_LOCATION_API_KEY?.trim()

  if (!region || !apiKey) {
    return NextResponse.json(
      { error: 'Places API not configured (NEXT_PUBLIC_AWS_REGION, NEXT_PUBLIC_AWS_LOCATION_API_KEY)' },
      { status: 500 }
    )
  }

  let body: { query?: string; biasLng?: number; biasLat?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (query.length < 2) {
    return NextResponse.json({ resultItems: [] })
  }

  const payload: Record<string, unknown> = {
    QueryText: query.slice(0, 200),
    MaxResults: 8,
    Language: 'en',
    Filter: { IncludeCountries: ['PHL'] },
    IntendedUse: 'SingleUse',
  }

  if (
    typeof body.biasLng === 'number' &&
    typeof body.biasLat === 'number' &&
    Number.isFinite(body.biasLng) &&
    Number.isFinite(body.biasLat)
  ) {
    payload.BiasPosition = [body.biasLng, body.biasLat]
  }

  const url = `https://places.geo.${region}.amazonaws.com/v2/autocomplete?key=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...amazonLocationForwardHeaders(req),
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: 'Autocomplete request failed', detail: text.slice(0, 200) },
        { status: res.status }
      )
    }

    const data = (await res.json()) as {
      ResultItems?: Array<{
        PlaceId?: string
        Title?: string
        Address?: { Label?: string }
      }>
    }

    const resultItems = (data.ResultItems ?? []).map((item) => ({
      placeId: item.PlaceId ?? '',
      title: item.Title ?? item.Address?.Label ?? '',
      subtitle: item.Address?.Label && item.Title !== item.Address?.Label ? item.Address?.Label : undefined,
    }))

    return NextResponse.json({ resultItems: resultItems.filter((r) => r.placeId && r.title) })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
