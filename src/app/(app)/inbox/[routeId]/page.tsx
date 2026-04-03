'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatManilaTime, formatRouteOfferScheduleSummary, placeTitleFromLabel } from '@/lib/utils'
import Button from '@/components/ui/Button'
import type { RideThreadMessage } from '@/types/database'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RouteMeta = {
  id: string
  driver_id: string
  origin_label: string | null
  destination_label: string | null
  departure_time: string
  first_departure_date: string
  frequency: string
  custom_days: number[] | null
}

export default function TripThreadPage() {
  const params = useParams()
  const router = useRouter()
  const routeId = typeof params.routeId === 'string' ? params.routeId : ''
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [routeMeta, setRouteMeta] = useState<RouteMeta | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [myName, setMyName] = useState<string>('')
  const [messages, setMessages] = useState<RideThreadMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const endRef = useRef<HTMLDivElement>(null)

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToEnd()
  }, [messages, scrollToEnd])

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('ride_thread_messages')
      .select('id, driver_route_id, sender_id, body, created_at, sender:users!sender_id(display_name)')
      .eq('driver_route_id', routeId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) {
      setMessages([])
      return
    }
    setMessages((data as unknown as RideThreadMessage[]) ?? [])
  }, [routeId, supabase])

  useEffect(() => {
    if (!routeId || !UUID_RE.test(routeId)) {
      /* eslint-disable react-hooks/set-state-in-effect -- invalid UUID: stop before async fetch */
      setForbidden(true)
      setLoading(false)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }

    let cancelled = false
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/sign-in')
        return
      }
      if (cancelled) return
      setMyId(user.id)

      const { data: me } = await supabase.from('users').select('display_name').eq('id', user.id).maybeSingle()
      if (!cancelled) setMyName((me?.display_name as string | null)?.trim() || 'You')

      const { data: route, error: routeErr } = await supabase
        .from('driver_routes')
        .select(
          'id, driver_id, origin_label, destination_label, departure_time, first_departure_date, frequency, custom_days',
        )
        .eq('id', routeId)
        .maybeSingle()

      if (cancelled) return
      if (routeErr || !route) {
        setForbidden(true)
        setLoading(false)
        return
      }

      const r = route as RouteMeta
      let allowed = r.driver_id === user.id
      if (!allowed) {
        const { data: booking } = await supabase
          .from('ride_bookings')
          .select('id')
          .eq('driver_route_id', routeId)
          .eq('passenger_id', user.id)
          .in('status', ['confirmed', 'in_progress'])
          .maybeSingle()
        allowed = !!booking
      }

      if (!allowed) {
        setForbidden(true)
        setLoading(false)
        return
      }

      setRouteMeta(r)
      await fetchMessages()
      if (cancelled) return
      setLoading(false)

      realtimeChannel = supabase
        .channel(`ride_thread:${routeId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'ride_thread_messages',
            filter: `driver_route_id=eq.${routeId}`,
          },
          async (payload) => {
            const nid = (payload.new as { id?: string })?.id
            if (!nid) {
              void fetchMessages()
              return
            }
            const { data: row } = await supabase
              .from('ride_thread_messages')
              .select('id, driver_route_id, sender_id, body, created_at, sender:users!sender_id(display_name)')
              .eq('id', nid)
              .maybeSingle()
            if (!row) {
              void fetchMessages()
              return
            }
            setMessages(prev => {
              if (prev.some(m => m.id === row.id)) return prev
              return [...prev, row as unknown as RideThreadMessage]
            })
          },
        )
        .subscribe()
    })()

    return () => {
      cancelled = true
      if (realtimeChannel) supabase.removeChannel(realtimeChannel)
    }
  }, [routeId, router, supabase, fetchMessages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !myId || !routeId) return
    setSendError('')
    setSending(true)
    const { error } = await supabase.from('ride_thread_messages').insert({
      driver_route_id: routeId,
      sender_id: myId,
      body: text,
    })
    setSending(false)
    if (error) {
      setSendError(error.message)
      return
    }
    setDraft('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-gray-400 animate-pulse">Opening chat…</span>
      </div>
    )
  }

  if (forbidden || !routeMeta) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-gray-600">You don&apos;t have access to this trip chat.</p>
        <Link href="/inbox" className="text-sm font-semibold text-emerald-600 hover:underline">
          Back to Inbox
        </Link>
      </div>
    )
  }

  const scheduleLine = formatRouteOfferScheduleSummary({
    first_departure_date: routeMeta.first_departure_date,
    departure_time: routeMeta.departure_time,
    frequency: routeMeta.frequency,
    custom_days: routeMeta.custom_days,
  })
  const shortRoute = `${placeTitleFromLabel(routeMeta.origin_label)} → ${placeTitleFromLabel(routeMeta.destination_label)}`

  return (
    <div className="flex flex-col pb-36 min-h-[60vh]">
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-gray-100 bg-gray-50/95 px-4 py-3 backdrop-blur">
        <Link
          href="/inbox"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800 mb-3"
        >
          <ArrowLeft size={16} /> Inbox
        </Link>
        {scheduleLine && scheduleLine !== '—' ? (
          <p className="text-lg sm:text-xl font-extrabold text-emerald-900 leading-snug tracking-tight">
            {scheduleLine}
          </p>
        ) : (
          <p className="text-lg font-extrabold text-emerald-900">Trip chat</p>
        )}
        <p className="text-sm text-gray-500 mt-1.5 leading-snug">{shortRoute}</p>
      </div>

      <div className="flex-1 space-y-3 min-h-[240px] max-h-[min(52vh,520px)] overflow-y-auto py-1">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10 px-2">
            No messages yet. Say hi and coordinate pick-up details.
          </p>
        ) : (
          messages.map(m => {
            const mine = m.sender_id === myId
            const senderRow = Array.isArray(m.sender) ? m.sender[0] : m.sender
            const name = mine ? (myName || 'You') : senderRow?.display_name?.trim() || 'Passenger'
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    mine ? 'bg-emerald-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'
                  }`}
                >
                  {!mine && (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-0.5">
                      {name}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`text-[10px] mt-1 tabular-nums ${
                      mine ? 'text-emerald-100' : 'text-gray-400'
                    }`}
                  >
                    {formatManilaTime(m.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-100 bg-white/95 backdrop-blur px-4 py-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-2xl mx-auto flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Message the group…"
            rows={2}
            maxLength={4000}
            className="flex-1 min-h-[44px] max-h-32 resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <Button type="submit" disabled={!draft.trim() || sending} loading={sending} className="shrink-0 h-11 px-4">
            <Send size={18} />
          </Button>
        </div>
        {sendError && <p className="text-xs text-red-500 mt-2 max-w-2xl mx-auto">{sendError}</p>}
      </form>
    </div>
  )
}
