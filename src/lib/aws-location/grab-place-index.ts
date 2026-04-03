import { withAPIKey } from '@aws/amazon-location-utilities-auth-helper'
import {
  GetPlaceCommand,
  LocationClient,
  SearchPlaceIndexForSuggestionsCommand,
} from '@aws-sdk/client-location'

/** Metro Manila center — WGS84 [longitude, latitude] for `BiasPosition`. */
export const METRO_MANILA_BIAS_POSITION: [number, number] = [121.0483, 14.56]

const DEFAULT_MAX_SUGGESTIONS = 5
const DEFAULT_LANGUAGE = 'en'

function createLocationClient(region: string, apiKey: string) {
  const auth = withAPIKey(apiKey, region)
  return new LocationClient({ region, ...auth.getClientConfig() })
}

export type PlaceSuggestionUi = {
  placeId: string
  title: string
  subtitle?: string
}

/**
 * Grab-backed place index (Places API v1) — autocomplete-style suggestions.
 * @see https://docs.aws.amazon.com/location/latest/APIReference/API_SearchPlaceIndexForSuggestions.html
 */
export async function searchGrabPlaceIndexForSuggestions(
  region: string,
  apiKey: string,
  indexName: string,
  queryText: string
): Promise<PlaceSuggestionUi[]> {
  const text = queryText.trim().slice(0, 200)
  if (text.length < 2) return []

  const client = createLocationClient(region, apiKey)
  const out = await client.send(
    new SearchPlaceIndexForSuggestionsCommand({
      IndexName: indexName,
      Text: text,
      BiasPosition: [...METRO_MANILA_BIAS_POSITION],
      MaxResults: DEFAULT_MAX_SUGGESTIONS,
      Language: DEFAULT_LANGUAGE,
      FilterCountries: ['PHL'],
    })
  )

  const results = out.Results ?? []
  return results
    .map((r) => {
      const placeId = r.PlaceId?.trim() ?? ''
      const title = r.Text?.trim() ?? ''
      const subtitle =
        r.Categories && r.Categories.length > 0 ? r.Categories.join(' · ') : undefined
      return { placeId, title, subtitle }
    })
    .filter((r) => r.placeId.length > 0 && r.title.length > 0)
}

export type ResolvedPlaceFromIndex = { lat: number; lng: number; label: string }

/**
 * Resolve a `PlaceId` from the same place index used for suggestions.
 */
export async function getGrabPlaceById(
  region: string,
  apiKey: string,
  indexName: string,
  placeId: string
): Promise<ResolvedPlaceFromIndex> {
  const client = createLocationClient(region, apiKey)
  const out = await client.send(
    new GetPlaceCommand({
      IndexName: indexName,
      PlaceId: placeId,
      Language: DEFAULT_LANGUAGE,
    })
  )

  const place = out.Place
  const point = place?.Geometry?.Point
  if (!point || point.length < 2) {
    throw new Error('No position in GetPlace response')
  }
  const [lng, lat] = point
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error('Invalid coordinates in GetPlace response')
  }

  const label =
    place?.Label?.trim() ||
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`

  return { lat, lng, label }
}
