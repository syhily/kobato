import { DuckDBTimestampTZValue, DuckDBUUIDValue, type DuckDBAppender, type DuckDBConnection } from '@duckdb/node-api'
import { randomUUID } from 'node:crypto'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * The access_events table shape — owned here (the infra DuckDB wrapper
 * receives this DDL from the caller). Generic blob/double slots in the
 * Cloudflare Analytics Engine style: new dimensions take a free slot
 * instead of a schema migration. No secondary indexes by design.
 */
export const ACCESS_EVENTS_DDL = `
CREATE TABLE IF NOT EXISTS access_events (
  event_id UUID PRIMARY KEY,
  index1 VARCHAR NOT NULL DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL,
  is_bot BOOLEAN NOT NULL,
  ${Array.from({ length: 16 }, (_, i) => `blob${i + 1} VARCHAR NOT NULL DEFAULT ''`).join(',\n  ')},
  double1 DOUBLE,
  double2 DOUBLE
)
`

/** 180-day telemetry retention (plan §1.11) — fixed by design, not a setting. */
export const ACCESS_EVENTS_RETENTION_DAYS = 180

/**
 * blob slot semantics — the single source of truth (a contract test pins
 * uniqueness and coverage). `blob5` holds the daily-salted visitor hash,
 * NEVER a raw IP. `blob16` is reserved and always written as ''.
 */
export const blobsMap = {
  blob1: 'path',
  blob2: 'referer',
  blob3: 'refererHost',
  blob4: 'ua',
  blob5: 'visitorHash',
  blob6: 'language',
  blob7: 'country',
  blob8: 'region',
  blob9: 'city',
  blob10: 'timezone',
  blob11: 'os',
  blob12: 'browser',
  blob13: 'browserType',
  blob14: 'device',
  blob15: 'deviceType',
  blob16: 'reserved',
} as const

export const doublesMap = {
  double1: 'latitude',
  double2: 'longitude',
} as const

export type BlobsKey = keyof typeof blobsMap
export type BlobName = (typeof blobsMap)[BlobsKey]

/** Entity key written to `index1`: `post:<id>` / `page:<id>` / '' for site-level views. */
export function index1Of(entityType: 'post' | 'page' | null, entityId: number | null): string {
  if (entityType === null || entityId === null) {
    return ''
  }
  return `${entityType}:${entityId}`
}

const uuidToUint128 = (uuid: string): bigint => BigInt(`0x${uuid.replaceAll('-', '')}`)

const BLOB_KEYS = unsafeCast<BlobsKey[]>(Object.keys(blobsMap).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))))

/**
 * Append one event as an access_events row — the single owner of the
 * event → blob-slot mapping. Callers own the Appender protocol
 * (`endRow`/`flushSync`/`closeSync`).
 */
export function appendAccessEvent(appender: DuckDBAppender, e: EnrichedAccessEvent): void {
  appender.appendUUID(DuckDBUUIDValue.fromUint128(uuidToUint128(randomUUID())))
  appender.appendVarchar(index1Of(e.entityType, e.entityId))
  appender.appendTimestampTZ(new DuckDBTimestampTZValue(BigInt(e.ts.getTime()) * 1000n))
  appender.appendBoolean(e.isBot)
  const blobs: Record<Exclude<BlobName, 'reserved'>, string | null> = {
    path: e.path,
    referer: e.referer,
    refererHost: e.refererHost,
    ua: e.ua,
    visitorHash: e.visitorHash,
    language: e.language,
    country: e.country,
    region: e.region,
    city: e.city,
    timezone: e.timezone,
    os: e.os,
    browser: e.browser,
    browserType: e.browserType,
    device: e.device,
    deviceType: e.deviceType,
  }
  for (const key of BLOB_KEYS) {
    const name = blobsMap[key]
    appender.appendVarchar(name === 'reserved' ? '' : (blobs[name] ?? ''))
  }
  if (e.latitude === null) {
    appender.appendNull()
  } else {
    appender.appendDouble(e.latitude)
  }
  if (e.longitude === null) {
    appender.appendNull()
  } else {
    appender.appendDouble(e.longitude)
  }
}

/**
 * Append a whole batch through the Appender protocol — `endRow()` per
 * row, `flushSync()` per ≤2048-row chunk. At-least-once: a mid-batch
 * failure leaves flushed rows visible while the batch dead-letters.
 */
export async function appendAccessEvents(writer: DuckDBConnection, events: EnrichedAccessEvent[]): Promise<void> {
  const appender = await writer.createAppender('access_events')
  try {
    let count = 0
    for (const event of events) {
      appendAccessEvent(appender, event)
      appender.endRow()
      count++
      if (count % 2048 === 0) {
        appender.flushSync()
      }
    }
  } finally {
    appender.closeSync()
  }
}
