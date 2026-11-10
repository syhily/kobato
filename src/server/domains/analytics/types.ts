// Analytics ingestion types: `RawAccessEvent` (cheap, from the request) →
// `EnrichedAccessEvent` (after geo/UA/bot enrichment). The enriched shape maps
// onto `access_events` blob slots through `blobsMap`/`doublesMap` in
// `services/access-log` — adding a field means assigning it a slot there.

import type { UaClientHints } from '@/server/domains/analytics/ua-parse'
import type { EntityTarget } from '@/server/infra/db/target'

export interface RawAccessEvent {
  /** The request's minted analytics event id — the beacon join key. */
  eventId: string
  ts: Date
  /** Client IP after proxy-header resolution; used for the GeoIP lookup and the salted hash, never persisted. */
  ip: string
  ua: string
  /** User-Agent Client Hints (`Sec-CH-UA-*`) — recovers device model / OS
   *  version that Chrome's UA reduction erased from the UA string. */
  clientHints?: UaClientHints | null
  /** Request path (no query string). */
  path: string
  referer: string | null
  acceptLanguage: string | null
  /** Polymorphic content target. `null` for non-content pages (home / listings / search). */
  target: EntityTarget | null
}

export interface EnrichedAccessEvent {
  eventId: string
  ts: Date
  /** Daily-salted SHA-256 of the client IP — the ONLY visitor identifier ever stored. */
  visitorHash: string
  path: string
  /** Entity kind feeding `index1`; null for site-level views. */
  entityType: 'post' | 'page' | null
  entityId: number | null
  /** Minimized referer (query/hash/userinfo stripped). */
  referer: string | null
  refererHost: string | null
  country: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  language: string | null
  ua: string | null
  browser: string | null
  browserType: string | null
  os: string | null
  device: string | null
  deviceType: string | null
  isBot: boolean
}
