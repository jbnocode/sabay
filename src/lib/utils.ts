import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function roundToNearest5(n: number): number {
  return Math.round(n / 5) * 5
}

export function formatPHP(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/** First comma segment: venue / POI name (e.g. "Market Market Loading and Unloading Bay") */
export function placeTitleFromLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Location'
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  return (parts[0] ?? raw).trim() || 'Location'
}

/** Locality line: city or major area (e.g. "Taguig City", "Pasay City") */
export function placeCityFromLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length < 2) return ''

  const cityNamed = parts.find(p => / city$/i.test(p))
  if (cityNamed) return cityNamed

  const ncrIdx = parts.findIndex(p => /metro manila|\(NCR\)|national capital region/i.test(p))
  if (ncrIdx > 0) {
    const c = parts[ncrIdx - 1]
    if (c && !/^\d{4}$/.test(c)) return c
  }

  const phIdx = parts.findIndex(p => /^philippines$/i.test(p))
  if (phIdx >= 2) {
    const c = parts[phIdx - 2]
    if (c && !/^\d{4}$/.test(c)) return c
  }

  const second = parts[1]
  if (second && second.length <= 56) return second
  return ''
}

/** Short label for long PH-style addresses: city / district, not the full street string */
export function shortPlaceLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Location'
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return raw.trim()

  const cityIdx = parts.findIndex(p => / city$/i.test(p))
  if (cityIdx >= 0) {
    const city = parts[cityIdx]
    const prev = cityIdx > 0 ? parts[cityIdx - 1] : ''
    if (prev && /BGC|Bonifacio|Ortigas|CBD|Westgate/i.test(prev) && prev.length <= 42) {
      return `${prev} · ${city}`
    }
    return city
  }

  const ncrIdx = parts.findIndex(p => /metro manila|\(NCR\)|national capital region/i.test(p))
  if (ncrIdx > 0) return parts[ncrIdx - 1]

  if (parts[0].length <= 36) return parts[0]
  return parts[Math.max(0, parts.length - 2)] ?? parts[parts.length - 1]
}

/** Route summary for trip cards */
export function formatTripRouteLine(
  distanceKm: number | null | undefined,
  durationHours: number | null | undefined,
): string | null {
  const bits: string[] = []
  if (distanceKm != null && !Number.isNaN(Number(distanceKm)) && Number(distanceKm) > 0) {
    bits.push(`${Number(distanceKm).toFixed(1)} km`)
  }
  if (durationHours != null && !Number.isNaN(Number(durationHours)) && Number(durationHours) > 0) {
    bits.push(`~${Math.max(1, Math.round(Number(durationHours) * 60))} min`)
  }
  return bits.length > 0 ? bits.join(' · ') : null
}

export const ROUTE_FREQ_LABELS: Record<string, string> = {
  once: 'One-time',
  daily: 'Daily',
  weekdays: 'Mon–Fri',
  mwf: 'Mon/Wed/Fri',
  custom: 'Custom',
}

/** Format an ISO timestamp in Asia/Manila (e.g. when a request was sent). */
export function formatManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

/** First departure date (weekday + calendar date), clock time, and frequency for a posted route. */
export function formatRouteOfferScheduleSummary(route: {
  first_departure_date?: string | null
  departure_time?: string | null
  frequency?: string | null
  custom_days?: number[] | null
}): string {
  const ymd = route.first_departure_date
  const t = route.departure_time?.slice(0, 5) ?? ''
  const freqKey = route.frequency ?? ''
  const freq = freqKey ? (ROUTE_FREQ_LABELS[freqKey] ?? freqKey) : ''

  const parts: string[] = []

  if (ymd) {
    try {
      const d = new Date(`${ymd}T12:00:00+08:00`)
      if (!Number.isNaN(d.getTime())) {
        const weekday = new Intl.DateTimeFormat('en-PH', {
          timeZone: 'Asia/Manila',
          weekday: 'long',
        }).format(d)
        const dateStr = new Intl.DateTimeFormat('en-PH', {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(d)
        parts.push(`${weekday} · ${dateStr}`)
      }
    } catch {
      /* ignore */
    }
  }

  if (t) parts.push(t)
  if (freq) parts.push(freq)
  if (freqKey === 'custom' && route.custom_days?.length) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const days = [...route.custom_days]
      .sort((a, b) => a - b)
      .map((n) => dayNames[n] ?? String(n))
      .join(', ')
    parts.push(`(${days})`)
  }

  return parts.length > 0 ? parts.join(' · ') : '—'
}

/** Clock time in Asia/Manila (for chat bubbles). */
export function formatManilaTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}
