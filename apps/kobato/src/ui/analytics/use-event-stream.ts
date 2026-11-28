import type { RealtimeEvent } from '@kobato/api/contracts/admin/analytics'

import { orpc } from '@kobato/api/browser/client'
import { useEffect, useRef, useState } from 'react'

const RECONNECT_DELAY_MS = 1_000

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
  const sizeRef = useRef(50)
  useEffect(() => {
    sizeRef.current = Math.max(bufferSize, 50)
  }, [bufferSize])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let stopped = false
    let controller: AbortController | null = null
    let activeIterator: AsyncIterator<RealtimeEvent[]> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const waitForReconnect = () =>
      new Promise<void>((resolve) => {
        reconnectTimer = setTimeout(resolve, RECONNECT_DELAY_MS)
      })

    const run = async () => {
      for (;;) {
        if (stopped) {
          return
        }
        controller = new AbortController()
        setState('connecting')
        try {
          const iterator = await orpc.admin.analytics.events(
            { since: lastSeenRef.current ?? undefined },
            { signal: controller.signal },
          )
          activeIterator = iterator
          if (stopped) {
            await iterator.return?.()
            return
          }
          setState('live')
          for await (const incoming of iterator) {
            if (stopped || incoming.length === 0) {
              continue
            }
            lastSeenRef.current = incoming[incoming.length - 1]!.ts
            setEvents((previous) => {
              const seen = new Set(previous.map(eventKey))
              const fresh = incoming.filter((event) => !seen.has(eventKey(event)))
              if (fresh.length === 0) {
                return previous
              }
              const next = [...previous, ...fresh]
              return next.length > sizeRef.current ? next.slice(next.length - sizeRef.current) : next
            })
          }
          if (!stopped) {
            setState('lost')
          }
        } catch {
          if (!stopped) {
            setState('lost')
          }
        }
        if (stopped) {
          return
        }
        await waitForReconnect()
      }
    }

    void run()
    return () => {
      stopped = true
      controller?.abort()
      void activeIterator?.return?.()
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
      }
    }
  }, [enabled])

  return { events, state }
}
