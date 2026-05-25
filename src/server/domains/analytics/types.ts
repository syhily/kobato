// Shared types for the analytics ingestion pipeline. Two stages:
//
//   1. `RawAccessEvent` — what the route loader / middleware can produce
//      cheaply from `request` + a resolved `EntityTarget`. No external
//      I/O.
//   2. `EnrichedAccessEvent` — what `enrichEvent()` returns after the
//      MaxMind lookup + UA parse + bot detection. This is what
//      `AccessLogBatcher` flushes to the `access_log` hypertable.
//
// Both shapes mirror the columns declared on the Drizzle `accessLog`
// table 1:1 so the COPY pipeline never has to project between
// types. Adding a column means appending to both interfaces AND the
// CSV column list inside `batcher.ts`'s `copyEvents()` — kept colocated
// in the batcher's `COPY_COLUMNS` constant so a missed update lands a
// type error.

import type { EntityTarget } from '@/server/infra/db/target'

export interface RawAccessEvent {
  /** Timestamp the request arrived; defaults to `new Date()` at call site. */
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
  entityId: bigint | null
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
