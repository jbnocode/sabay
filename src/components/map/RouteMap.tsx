'use client'
import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LatLng } from '@/lib/matching/geometry'

// Manila default center
const MANILA_CENTER: [number, number] = [121.0244, 14.5547]

/** Public style when Amazon Location is missing, invalid, or returns 403 (referrer / permissions / bad key). */
const FALLBACK_STYLE = 'https://demotiles.maplibre.org/style.json'

const MAPS_V2_STYLES = new Set(['standard', 'monochrome', 'hybrid', 'satellite'])

/**
 * Amazon Location map style URL, or fallback.
 *
 * **GrabMaps** (Philippines / SEA) use a *map resource* you create in the console with style
 * `VectorGrabStandardLight` or `VectorGrabStandardDark` — only in `ap-southeast-1`.
 * Set `NEXT_PUBLIC_AWS_LOCATION_GRAB_MAP_RESOURCE` (or `MAP_RESOURCE_NAME` / legacy name) to that
 * resource's name — we use the v0 descriptor URL.
 * @see https://docs.aws.amazon.com/location/previous/developerguide/grab.html
 *
 * `provider/default` keys use Maps API v2: `/v2/styles/Standard/descriptor?...`
 */
function resolveMapStyle(): { styleUrl: string; usingAmazon: boolean } {
  const override = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
  if (override) return { styleUrl: override, usingAmazon: false }

  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim() ?? ''
  let apiKey = process.env.NEXT_PUBLIC_AWS_LOCATION_API_KEY?.trim() ?? ''
  if (apiKey.endsWith('_api_key')) {
    apiKey = apiKey.slice(0, -'_api_key'.length)
  }

  const legacyMapName = process.env.NEXT_PUBLIC_AWS_LOCATION_MAP_LEGACY_NAME?.trim() ?? ''
  const mapResourceName =
    process.env.NEXT_PUBLIC_AWS_LOCATION_MAP_RESOURCE_NAME?.trim() ||
    process.env.NEXT_PUBLIC_AWS_LOCATION_GRAB_MAP_RESOURCE?.trim() ||
    legacyMapName
  const styleFromEnv = process.env.NEXT_PUBLIC_AWS_LOCATION_MAP_STYLE?.trim() ?? ''
  const mapNameCompat = process.env.NEXT_PUBLIC_AWS_LOCATION_MAP_NAME?.trim() ?? ''

  let v2Style = styleFromEnv
  if (!v2Style && mapNameCompat && MAPS_V2_STYLES.has(mapNameCompat.toLowerCase())) {
    v2Style = mapNameCompat
  }
  if (!v2Style) v2Style = 'Standard'
  v2Style = v2Style.charAt(0).toUpperCase() + v2Style.slice(1).toLowerCase()
  if (!MAPS_V2_STYLES.has(v2Style.toLowerCase())) v2Style = 'Standard'

  const colorScheme =
    process.env.NEXT_PUBLIC_AWS_LOCATION_MAP_COLOR_SCHEME?.trim().toLowerCase() === 'dark'
      ? 'Dark'
      : 'Light'

  const placeholder =
    !region || !apiKey || /your_|placeholder|example\.com/i.test(region + apiKey)

  const regionOk = /^[a-z]{2}-[a-z0-9-]+-\d+$/i.test(region)
  const keyOk = apiKey.length >= 20 && !/\s/.test(apiKey)

  if (!placeholder && regionOk && keyOk) {
    if (mapResourceName && !/your_|placeholder/i.test(mapResourceName)) {
      const styleUrl =
        `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${encodeURIComponent(mapResourceName)}/style-descriptor` +
        `?key=${encodeURIComponent(apiKey)}`
      return { styleUrl, usingAmazon: true }
    }

    const styleUrl =
      `https://maps.geo.${region}.amazonaws.com/v2/styles/${encodeURIComponent(v2Style)}/descriptor` +
      `?key=${encodeURIComponent(apiKey)}&color-scheme=${encodeURIComponent(colorScheme)}`
    return { styleUrl, usingAmazon: true }
  }

  return { styleUrl: FALLBACK_STYLE, usingAmazon: false }
}

interface Props {
  routeGeoJson?: GeoJSON.LineString | null
  origin?: LatLng | null
  destination?: LatLng | null
  pickupPoint?: LatLng | null
  dropoffPoint?: LatLng | null
  onMapClick?: (lngLat: LatLng) => void
  picking?: 'origin' | 'destination' | 'pickup' | 'dropoff' | null
  className?: string
}

type MarkerKey = 'origin' | 'destination' | 'pickup' | 'dropoff'

const MARKER_CONFIG: Record<MarkerKey, { color: string; label: string }> = {
  origin:      { color: '#059669', label: 'Start' },
  destination: { color: '#dc2626', label: 'End' },
  pickup:      { color: '#2563eb', label: 'Pick-up' },
  dropoff:     { color: '#7c3aed', label: 'Drop-off' },
}

export default function RouteMap({
  routeGeoJson,
  origin,
  destination,
  pickupPoint,
  dropoffPoint,
  onMapClick,
  picking,
  className = 'h-64 w-full rounded-2xl overflow-hidden',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Partial<Record<MarkerKey, maplibregl.Marker>>>({})
  const fallbackAppliedRef = useRef(false)
  const [switchedToFallback, setSwitchedToFallback] = useState(false)
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick

  const initialStyle = useMemo(() => resolveMapStyle(), [])

  const addOrUpdateMarker = useCallback(
    (key: MarkerKey, lngLat: [number, number]) => {
      if (!mapRef.current) return
      const { color, label } = MARKER_CONFIG[key]

      const existing = markersRef.current[key]
      if (existing) {
        existing.setLngLat(lngLat)
        return
      }
      const el = document.createElement('div')
      el.innerHTML = `
        <div style="
          background:${color};
          color:#fff;
          padding:3px 10px;
          border-radius:999px;
          font-size:11px;
          font-weight:700;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,.25);
          font-family:system-ui,sans-serif;
        ">${label}</div>`
      markersRef.current[key] = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(mapRef.current)
    },
    []
  )

  const removeMarker = useCallback((key: MarkerKey) => {
    markersRef.current[key]?.remove()
    delete markersRef.current[key]
  }, [])

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: initialStyle.styleUrl,
      center: MANILA_CENTER,
      zoom: 11,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    const ensureRouteLayer = () => {
      if (map.getSource('route')) return
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#059669', 'line-width': 4, 'line-opacity': 0.9 },
      })
    }

    map.on('load', ensureRouteLayer)

    // Amazon 403 / bad key / referrer: load free tiles so pins and routes still work
    map.on('error', (e) => {
      if (initialStyle.styleUrl === FALLBACK_STYLE || fallbackAppliedRef.current) return
      const msg = String((e.error as Error)?.message ?? e.error ?? '')
      if (!/403|AJAXError|Forbidden|style-descriptor/i.test(msg)) return
      fallbackAppliedRef.current = true
      setSwitchedToFallback(true)
      // diff:false avoids MapLibre 5.x diff bugs (setProjection undefined) when swapping Amazon → fallback
      map.setStyle(FALLBACK_STYLE, { diff: false })
      map.once('style.load', ensureRouteLayer)
    })

    map.on('click', e => {
      onMapClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [initialStyle.styleUrl])

  // Crosshair cursor while picking
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.getCanvas().style.cursor = picking ? 'crosshair' : ''
  }, [picking])

  // Draw / clear route polyline
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyRoute = () => {
      const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined
      if (!src) return

      if (routeGeoJson) {
        src.setData({ type: 'Feature', properties: {}, geometry: routeGeoJson })
        const coords = routeGeoJson.coordinates as [number, number][]
        if (coords.length >= 2) {
          const bounds = coords.reduce(
            (b, c) => b.extend(c as maplibregl.LngLatLike),
            new maplibregl.LngLatBounds(coords[0], coords[0])
          )
          map.fitBounds(bounds, { padding: 52, maxZoom: 14 })
        }
      } else {
        src.setData({ type: 'FeatureCollection', features: [] })
      }
    }

    if (map.isStyleLoaded()) {
      applyRoute()
    } else {
      map.once('load', applyRoute)
    }
  }, [routeGeoJson])

  // Marker sync helpers
  useEffect(() => {
    if (origin) addOrUpdateMarker('origin', [origin.lng, origin.lat])
    else removeMarker('origin')
  }, [origin, addOrUpdateMarker, removeMarker])

  useEffect(() => {
    if (destination) addOrUpdateMarker('destination', [destination.lng, destination.lat])
    else removeMarker('destination')
  }, [destination, addOrUpdateMarker, removeMarker])

  useEffect(() => {
    if (pickupPoint) addOrUpdateMarker('pickup', [pickupPoint.lng, pickupPoint.lat])
    else removeMarker('pickup')
  }, [pickupPoint, addOrUpdateMarker, removeMarker])

  useEffect(() => {
    if (dropoffPoint) addOrUpdateMarker('dropoff', [dropoffPoint.lng, dropoffPoint.lat])
    else removeMarker('dropoff')
  }, [dropoffPoint, addOrUpdateMarker, removeMarker])

  const showFallbackHint = !initialStyle.usingAmazon || switchedToFallback

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full min-h-[inherit]" />
      {showFallbackHint && (
        <p className="absolute bottom-1 left-1 right-1 mx-auto max-w-[95%] rounded-lg bg-amber-50/95 px-2 py-1 text-center text-[10px] leading-tight text-amber-900 ring-1 ring-amber-200/80">
          Demo map tiles (MapLibre). For Amazon: set region + API key + referrer{' '}
          <code className="rounded bg-amber-100 px-0.5">http://localhost:3000/*</code>. GrabMaps need{' '}
          <code className="rounded bg-amber-100 px-0.5">ap-southeast-1</code> and{' '}
          <code className="rounded bg-amber-100 px-0.5">NEXT_PUBLIC_AWS_LOCATION_GRAB_MAP_RESOURCE</code> (console map name).{' '}
          provider/default uses v2 Standard/Monochrome/etc.
        </p>
      )}
    </div>
  )
}
