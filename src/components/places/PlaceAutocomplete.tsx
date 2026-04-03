'use client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LatLng } from '@/lib/matching/geometry'

export type ResolvedPlace = LatLng & { label: string }

interface Suggestion {
  placeId: string
  title: string
  subtitle?: string
}

interface Props {
  label: string
  placeholder?: string
  value: string
  onTextChange: (text: string) => void
  onResolved: (place: ResolvedPlace) => void
  /** Bias suggestions toward a point (e.g. Metro Manila). */
  bias?: { lng: number; lat: number }
  disabled?: boolean
  className?: string
  /** Visually hide label but keep it for screen readers (e.g. grouped field layout). */
  hideLabel?: boolean
}

export default function PlaceAutocomplete({
  label,
  placeholder = 'Search address or place',
  value,
  onTextChange,
  onResolved,
  bias,
  disabled,
  className,
  hideLabel,
}: Props) {
  const id = useId()
  const listId = `${id}-list`
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setSuggestions([])
        return
      }
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/places/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            ...(bias ? { biasLng: bias.lng, biasLat: bias.lat } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setSuggestions([])
          setError(typeof data.error === 'string' ? data.error : 'Search failed')
          return
        }
        setSuggestions(data.resultItems ?? [])
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
        setError('Search failed')
      } finally {
        setLoading(false)
      }
    },
    [bias]
  )

  useEffect(() => {
    setActiveIndex(-1)
  }, [suggestions])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value)
    }, 320)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, fetchSuggestions])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const pickSuggestion = async (s: Suggestion) => {
    setOpen(false)
    setSuggestions([])
    onTextChange(s.title)
    try {
      const res = await fetch(
        `/api/places/resolve?placeId=${encodeURIComponent(s.placeId)}`
      )
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not load place')
        return
      }
      onResolved({
        lat: data.lat,
        lng: data.lng,
        label: data.label || s.title,
      })
    } catch {
      setError('Could not load place')
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      void pickSuggestion(suggestions[activeIndex]!)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={cn('relative flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : 'text-sm font-medium text-gray-700'}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onTextChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => value.length >= 2 && setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(
          'h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 placeholder:text-gray-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-gray-50'
        )}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {open && (suggestions.length > 0 || loading) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {loading && (
            <li className="px-3 py-2 text-xs text-gray-400">Searching…</li>
          )}
          {!loading &&
            suggestions.map((s, i) => (
              <li key={s.placeId} role="option" aria-selected={i === activeIndex}>
                <button
                  type="button"
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-emerald-50',
                    i === activeIndex && 'bg-emerald-50'
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pickSuggestion(s)}
                >
                  <span className="font-medium text-gray-900 block truncate">{s.title}</span>
                  {s.subtitle && (
                    <span className="text-xs text-gray-500 block truncate">{s.subtitle}</span>
                  )}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
