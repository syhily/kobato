import { useEffect } from 'react'
import { useMatches } from 'react-router'

import { buildDeviceEnvBeacon } from '@/client/lib/device-env'
import { isRecord } from '@/shared/utils/type-guards'

// ADR-0006 client collector: one beacon per loader-published event id.
// Static fields (screen/touch/locale/hardware) go once per browser session,
// dynamic fields on every page view. Best-effort by design — `sendBeacon`
// only, no fetch fallback, no retry; DNT silences the client track entirely.

const STATIC_SENT_KEY = 'kobato.env.static'
const BEACON_PATH = '/api/analytics/env'

// Bounded replay guard: back/forward navigation (and StrictMode's double
// effect in dev) re-fires with a past event id, and a second beacon for the
// same id would collide with the sidecar's primary key. The cap only needs
// to span a navigation history, not the whole session — clear-and-restart
// is enough once it fills.
const SENT_EVENT_IDS_LIMIT = 500
const sentEventIds = new Set<string>()

/** Test seam: forget every sent event id. */
export function __resetDeviceEnvBeaconForTests(): void {
  sentEventIds.clear()
}

function rememberSentEventId(eventId: string): void {
  if (sentEventIds.size >= SENT_EVENT_IDS_LIMIT) {
    sentEventIds.clear()
  }
  sentEventIds.add(eventId)
}

/** The deepest matched route that published an `eid` (listing and detail loaders both put it at the loader-data top level). */
export function extractAnalyticsEventId(matches: readonly { loaderData?: unknown }[]): string | null {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const data = matches[i]?.loaderData
    if (isRecord(data) && typeof data.eid === 'string' && data.eid !== '') {
      return data.eid
    }
  }
  return null
}

function hasStaticBlockBeenSent(): boolean {
  try {
    return window.sessionStorage.getItem(STATIC_SENT_KEY) === '1'
  } catch {
    return false
  }
}

function markStaticBlockSent(): void {
  try {
    window.sessionStorage.setItem(STATIC_SENT_KEY, '1')
  } catch {
    // Private mode / storage disabled — the session simply re-sends the static block.
  }
}

/** Build + post one beacon. Returns false when DNT or no `sendBeacon` silenced it. */
export function sendDeviceEnvBeacon(eventId: string): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }
  if (navigator.doNotTrack === '1') {
    return false
  }
  if (typeof navigator.sendBeacon !== 'function') {
    return false
  }
  // Already sent in this page's lifetime (navigation replay / StrictMode).
  if (sentEventIds.has(eventId)) {
    return false
  }

  const includeStatic = !hasStaticBlockBeenSent()
  const payload = buildDeviceEnvBeacon(eventId, includeStatic)
  try {
    const sent = navigator.sendBeacon(BEACON_PATH, new Blob([JSON.stringify(payload)], { type: 'application/json' }))
    if (sent) {
      if (includeStatic) {
        markStaticBlockSent()
      }
      rememberSentEventId(eventId)
    }
    return sent
  } catch {
    return false
  }
}

/** Mounted once by the public layout; every browser API lives inside the effect. */
export function useDeviceEnvBeacon(): void {
  const matches = useMatches()
  const eventId = extractAnalyticsEventId(matches)

  useEffect(() => {
    if (eventId !== null) {
      sendDeviceEnvBeacon(eventId)
    }
  }, [eventId])
}
