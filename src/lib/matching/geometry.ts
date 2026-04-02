export type LatLng = { lat: number; lng: number }

/** Haversine distance in metres between two lat/lng points */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Equirectangular projection param for closest-point-on-segment */
function projectParam(a: LatLng, b: LatLng, p: LatLng): number {
  const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180)
  const x = (p.lng - a.lng) * Math.cos(midLat)
  const y = p.lat - a.lat
  const dx = (b.lng - a.lng) * Math.cos(midLat)
  const dy = b.lat - a.lat
  const dot = x * dx + y * dy
  const len2 = dx * dx + dy * dy
  return len2 === 0 ? 0 : dot / len2
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}

function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

/**
 * Project a point onto a GeoJSON LineString.
 * Returns the nearest point on the line and the fraction along the total length (0..1).
 * NOTE: for production accuracy use PostGIS ST_ClosestPoint on the server.
 */
export function nearestPointOnLine(
  coords: [number, number][],  // GeoJSON [lng, lat]
  p: LatLng
): { projected: LatLng; fractionAlong: number; distanceMeters: number } {
  const line: LatLng[] = coords.map(([lng, lat]) => ({ lat, lng }))

  if (line.length < 2) {
    return { projected: line[0], fractionAlong: 0, distanceMeters: haversineMeters(p, line[0]) }
  }

  let totalLen = 0
  const segLens: number[] = []
  for (let i = 0; i < line.length - 1; i++) {
    const d = haversineMeters(line[i], line[i + 1])
    segLens.push(d)
    totalLen += d
  }

  let bestDist = Infinity
  let bestFrac = 0
  let bestPoint = line[0]
  let acc = 0

  for (let i = 0; i < line.length - 1; i++) {
    const t = clamp(projectParam(line[i], line[i + 1], p), 0, 1)
    const proj = interpolate(line[i], line[i + 1], t)
    const dist = haversineMeters(p, proj)
    if (dist < bestDist) {
      bestDist = dist
      bestFrac = totalLen === 0 ? 0 : (acc + t * segLens[i]) / totalLen
      bestPoint = proj
    }
    acc += segLens[i]
  }

  return { projected: bestPoint, fractionAlong: bestFrac, distanceMeters: bestDist }
}

/**
 * Returns true if both pickup AND dropoff are within corridorMeters of the route
 * AND pickup comes before dropoff along the line.
 */
export function passengerFitsRoute(
  coords: [number, number][],
  pickup: LatLng,
  dropoff: LatLng,
  corridorMeters = 1000
): {
  ok: boolean
  pickupFrac: number
  dropoffFrac: number
  pickupProjected: LatLng
  dropoffProjected: LatLng
} {
  const npPick = nearestPointOnLine(coords, pickup)
  const npDrop = nearestPointOnLine(coords, dropoff)

  const ok =
    npPick.distanceMeters <= corridorMeters &&
    npDrop.distanceMeters <= corridorMeters &&
    npPick.fractionAlong < npDrop.fractionAlong

  return {
    ok,
    pickupFrac: npPick.fractionAlong,
    dropoffFrac: npDrop.fractionAlong,
    pickupProjected: npPick.projected,
    dropoffProjected: npDrop.projected,
  }
}
