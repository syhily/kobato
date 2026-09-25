// Shared types for the analytics ingestion pipeline: `RawAccessEvent`
// (cheap, from the request) → `EnrichedAccessEvent` (after geo/UA/bot
// enrichment). The enriched shape maps onto the `access_events` blob
// slots through `blobsMap`/`doublesMap` in `services/access-log` —
// adding a field means assigning it a slot there.

import type { EntityTarget } from '@/server/infra/db/target'

export interface RawAccessEvent {
  /** Defaults to `new Date()` at call site. */
  ts: Date
  /** Client IP after proxy-header resolution; used for the GeoIP lookup and the salted hash, never persisted. */
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
}

export interface EnrichedAccessEvent {
  ts: Date
  /** Daily-salted SHA-256 of the client IP — the ONLY visitor identifier ever stored. */
  visitorHash: string
  path: string
  /** Entity key for `index1`: `post:<ownerId>` / `page:<ownerId>` / null for site-level views. */
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
