// Shared types for the analytics ingestion pipeline: `RawAccessEvent`
// (cheap, from the request) → `EnrichedAccessEvent` (after geo/UA/bot
// enrichment). Both mirror the `accessLog` columns 1:1 — adding a column
// means updating both plus `appendAccessEvent`'s insert mapping.

import type { EntityTarget } from '@/server/infra/db/target'

export interface RawAccessEvent {
  /** Defaults to `new Date()` at call site. */
  ts: Date
  /** Client IP after proxy-header resolution. Empty string falls through to a null `ip` column. */
  ip: string
  /** Raw `User-Agent` header. Empty string is fine — `enrich()` will null the parsed fields. */
  ua: string
  /** Request path (no query string). */
  path: string
  /** Raw `Referer` header. */
  referer: string | null
  /** Raw `Accept-Language` header. */
  acceptLanguage: string | null
  /** Polymorphic content target. `null` for non-content pages (home / listings / search). */
  target: EntityTarget | null
  /** Long-lived visitor cookie (`kobato_aid`). `null` on the first request before the cookie is issued. */
  sessionId: string | null
}

export interface EnrichedAccessEvent {
  ts: Date
  visitorHash: string
  sessionId: string | null
  ip: string | null
  path: string
  entityType: 'post' | 'page' | null
  entityId: number | null
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
  browserVersion: string | null
  os: string | null
  osVersion: string | null
  device: string | null
  deviceType: string | null
  isBot: boolean
}
