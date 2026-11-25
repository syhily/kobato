import { serializeKobatoRpcInput } from '@kobato/api/client/rpc-serialization'
import { PUBLIC_ANALYTICS_RECORD_DEVICE_ENV_RPC_PATH } from '@kobato/api/rpc/public/analytics'
import { isRecord } from '@kobato/utils/type-guards'
import { useEffect } from 'react'
import { useMatches } from 'react-router'

import { buildDeviceEnvBeacon } from '@/document/device-env'

const STATIC_SENT_KEY = 'kobato.env.static'
const BEACON_PATH = PUBLIC_ANALYTICS_RECORD_DEVICE_ENV_RPC_PATH

const SENT_EVENT_IDS_LIMIT = 500
const sentEventIds = new Set<string>()

export function __resetDeviceEnvBeaconForTests(): void {
  sentEventIds.clear()
}

function rememberSentEventId(eventId: string): void {
  if (sentEventIds.size >= SENT_EVENT_IDS_LIMIT) {
    sentEventIds.clear()
  }
  sentEventIds.add(eventId)
}

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
  } catch {}
}

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
  if (sentEventIds.has(eventId)) {
    return false
  }

  const includeStatic = !hasStaticBlockBeenSent()
  const payload = buildDeviceEnvBeacon(eventId, includeStatic)
  try {
    const body = JSON.stringify(serializeKobatoRpcInput(payload))
    const sent = navigator.sendBeacon(BEACON_PATH, new Blob([body], { type: 'application/json' }))
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

export function useDeviceEnvBeacon(): void {
  const matches = useMatches()
  const eventId = extractAnalyticsEventId(matches)

  useEffect(() => {
    if (eventId !== null) {
      sendDeviceEnvBeacon(eventId)
    }
  }, [eventId])
}
