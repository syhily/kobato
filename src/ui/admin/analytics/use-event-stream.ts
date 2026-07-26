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

// EventSource subscription hook for the realtime tail: a rolling buffer of
// the latest `bufferSize` events plus a "connecting / live / lost" state.
// Reconnect/backoff is the browser's native EventSource behavior; `onerror`
// after the socket gives up just marks the state lost.

export interface UseEventStreamOptions {
  bufferSize?: number
  enabled?: boolean
}

export function useEventStream({ bufferSize = 100, enabled = true }: UseEventStreamOptions = {}) {
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const [state, setState] = useState<'connecting' | 'live' | 'lost'>('connecting')
  const lastSeenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
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
          const next = [...prev, ...incoming]
          return next.length > bufferSize ? next.slice(next.length - bufferSize) : next
        })
      } catch {
        // bad payload — skip
      }
    })

    return () => {
      source.close()
    }
  }, [bufferSize, enabled])

  return { events, state }
}
