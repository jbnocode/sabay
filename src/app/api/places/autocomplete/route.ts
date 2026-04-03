import { NextRequest, NextResponse } from 'next/server'
import { searchGrabPlaceIndexForSuggestions } from '@/lib/aws-location/grab-place-index'

function locationApiKey(): string | undefined {
  return (
    process.env.AWS_LOCATION_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_AWS_LOCATION_API_KEY?.trim()
  )
}

function placeIndexName(): string {
  return (
    process.env.AWS_LOCATION_GRAB_PLACE_INDEX_NAME?.trim() ||
    process.env.NEXT_PUBLIC_AWS_LOCATION_GRAB_PLACE_INDEX_NAME?.trim() ||
    'GrabManilaIndex'
  )
}

/**
 * GrabMaps place index — `SearchPlaceIndexForSuggestions` via `@aws-sdk/client-location`
 * (API key auth through `@aws/amazon-location-utilities-auth-helper`).
 */
export async function POST(req: NextRequest) {
  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim()
  const apiKey = locationApiKey()
  const indexName = placeIndexName()

  if (!region || !apiKey) {
    return NextResponse.json(
      {
        error:
          'Places API not configured (NEXT_PUBLIC_AWS_REGION and AWS_LOCATION_API_KEY or NEXT_PUBLIC_AWS_LOCATION_API_KEY)',
      },
      { status: 500 }
    )
  }

  let body: { query?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const query = typeof body.query === 'string' ? body.query : ''
  if (query.trim().length < 2) {
    return NextResponse.json({ resultItems: [] })
  }

  try {
    const resultItems = await searchGrabPlaceIndexForSuggestions(
      region,
      apiKey,
      indexName,
      query
    )
    return NextResponse.json({ resultItems })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    const name = e instanceof Error && 'name' in e ? (e as Error & { name: string }).name : ''
    const status =
      name === 'ValidationException' || name === 'ResourceNotFoundException' ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
