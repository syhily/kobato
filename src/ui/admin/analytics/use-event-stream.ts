import { useEffect, useRef, useState } from 'react'

import type { RealtimeEvent } from '@/shared/contracts/analytics'

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ts' in value &&
    typeof (value as Record<string, unknown>).ts === 'string' &&
    'path' in value &&
    typeof (value as Record<string, unknown>).path === 'string'
  )
}

// EventSource hook for the realtime tail: rolling buffer + connecting / live /
// lost state; native reconnects resend from a stale `since`, so the merge dedupes.
/** Identity of one event for reconnect dedup (audit P1-20). */
function eventKey(event: RealtimeEvent): string {
  return [event.ts, event.path, event.country, event.city, event.browser, event.os, event.deviceType, event.isBot].join(
    '\n',
  )
}

export interface UseEventStreamOptions {
  bufferSize?: number
  enabled?: boolean
}

export function useEventStream({ bufferSize = 100, enabled = true }: UseEventStreamOptions = {}) {
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const [state, setState] = useState<'connecting' | 'live' | 'lost'>('connecting')
  const lastSeenRef = useRef<string | null>(null)
  // Floor at the server replay tail (queryRealtimeTail's LIMIT 50) — a smaller buffer would truncate a reconnect's replay (fix-review).
  const size = Math.max(bufferSize, 50)

  useEffect(() => {
    if (!enabled || window?.EventSource === undefined) {
      return
    }

    const url = new URL('/api/analytics/events', window.location.origin)
    if (lastSeenRef.current) {
      url.searchParams.set('since', lastSeenRef.current)
    }
    const source = new EventSource(url.toString(), { withCredentials: true })

    source.onopen = () => setState('live')
    source.onerror = () => setState('lost')

    source.addEventListener('events', (raw) => {
      try {
        if (!(raw instanceof MessageEvent)) {
          return
        }
        const data: unknown = JSON.parse(String(raw.data))
        if (!Array.isArray(data)) {
          return
        }
        const incoming = data.filter(isRealtimeEvent)
        if (incoming.length === 0) {
          return
        }
        lastSeenRef.current = incoming[incoming.length - 1]!.ts
        setEvents((prev) => {
          // Drop rows already in the buffer — a reconnect resends the tail from the stale `since`.
          const seen = new Set(prev.map(eventKey))
          const fresh = incoming.filter((event) => !seen.has(eventKey(event)))
          if (fresh.length === 0) {
            return prev
          }
          const next = [...prev, ...fresh]
          return next.length > size ? next.slice(next.length - size) : next
        })
      } catch {
        // bad payload — skip
      }
    })

    return () => {
      source.close()
    }
  }, [size, enabled])

  return { events, state }
}
