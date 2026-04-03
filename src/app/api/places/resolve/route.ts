import { NextRequest, NextResponse } from 'next/server'
import { getGrabPlaceById } from '@/lib/aws-location/grab-place-index'

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
 * Grab place index — `GetPlace` by `PlaceId` (same index as autocomplete).
 */
export async function GET(req: NextRequest) {
  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim()
  const apiKey = locationApiKey()
  const indexName = placeIndexName()
  const placeId = req.nextUrl.searchParams.get('placeId')?.trim()

  if (!region || !apiKey) {
    return NextResponse.json({ error: 'Places API not configured' }, { status: 500 })
  }

  if (!placeId) {
    return NextResponse.json({ error: 'Missing placeId' }, { status: 400 })
  }

  try {
    const { lat, lng, label } = await getGrabPlaceById(region, apiKey, indexName, placeId)
    return NextResponse.json({ lat, lng, label })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    const name = e instanceof Error && 'name' in e ? (e as Error & { name: string }).name : ''
    if (name === 'ResourceNotFoundException') {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
