import {
  BOOLEAN,
  DOUBLE,
  DuckDBDataChunk,
  DuckDBTimestampTZValue,
  DuckDBUUIDValue,
  TIMESTAMPTZ,
  UUID,
  VARCHAR,
  type DuckDBConnection,
  type DuckDBType,
  type DuckDBValue,
} from '@duckdb/node-api'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * The access_events table shape — owned here, passed to the infra DuckDB
 * wrapper. Generic blob/double slots in the Cloudflare Analytics Engine style:
 * new dimensions take a free slot instead of a schema migration. No secondary
 * indexes by design.
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

/** 180-day telemetry retention; fixed by design, not a setting. */
export const ACCESS_EVENTS_RETENTION_DAYS = 180

/**
 * blob slot semantics — the single source of truth (a contract test pins
 * uniqueness and coverage). `blob5` holds the daily-salted visitor hash, NEVER a
 * raw IP. `blob16` is reserved and always written as ''.
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

/** Column types in DDL order — data chunks are created from this. */
const ACCESS_EVENTS_CHUNK_TYPES: DuckDBType[] = [
  UUID,
  VARCHAR,
  TIMESTAMPTZ,
  BOOLEAN,
  ...Array.from({ length: 16 }, () => VARCHAR),
  DOUBLE,
  DOUBLE,
]

function eventBlobs(e: EnrichedAccessEvent): Record<Exclude<BlobName, 'reserved'>, string | null> {
  return {
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
}

/** Pivot a batch of events into the column arrays of one data chunk (DDL order). */
function accessEventColumns(events: EnrichedAccessEvent[]): DuckDBValue[][] {
  const blobRecords = events.map(eventBlobs)
  return [
    events.map((e) => DuckDBUUIDValue.fromUint128(uuidToUint128(e.eventId))),
    events.map((e) => index1Of(e.entityType, e.entityId)),
    events.map((e) => new DuckDBTimestampTZValue(BigInt(e.ts.getTime()) * 1000n)),
    events.map((e) => e.isBot),
    ...BLOB_KEYS.map((key) => {
      const name = blobsMap[key]
      return blobRecords.map((record) => (name === 'reserved' ? '' : (record[name] ?? '')))
    }),
    events.map((e) => e.latitude),
    events.map((e) => e.longitude),
  ]
}

/**
 * Append a batch as data chunks — one `setColumns` + `appendDataChunk` per
 * ≤2048-row slice instead of an appender call per cell. At-least-once: a
 * mid-batch failure leaves flushed chunks visible while the batch dead-letters.
 */
export async function appendAccessEvents(writer: DuckDBConnection, events: EnrichedAccessEvent[]): Promise<void> {
  const appender = await writer.createAppender('access_events')
  try {
    for (let offset = 0; offset < events.length; offset += 2048) {
      const chunk = DuckDBDataChunk.create(ACCESS_EVENTS_CHUNK_TYPES)
      chunk.setColumns(accessEventColumns(events.slice(offset, offset + 2048)))
      appender.appendDataChunk(chunk)
      appender.flushSync()
    }
  } finally {
    appender.closeSync()
  }
}
