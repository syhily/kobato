import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { from as copyFrom } from 'pg-copy-streams'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { getRawPool } from '@/server/infra/db/pool'
import { getLogger } from '@/server/infra/logger'
import { registerShutdownHook } from '@/server/infra/shutdown'

// In-memory aggregator for `access_log` rows. Same flush-trigger
// contract as `@/server/domains/analytics/pv-batcher`'s `PageViewBatcher`:
//
//   - Buffer length reaches `flushThreshold`.
//   - `flushIntervalMs` elapses since the first push after the last
//     flush (lazy timer, `.unref()` so it doesn't keep Node alive).
//   - Process receives SIGTERM / SIGINT / `beforeExit`.
//
// Two differences:
//   1. Buffer is `EnrichedAccessEvent[]` (not aggregated counters) —
//      every visit is a distinct row.
//   2. Flush goes through `COPY FROM STDIN (FORMAT csv)` for ~5x
//      throughput over per-row `INSERT`. The CSV escaper below
//      mirrors Postgres' CSV mode so a UA string containing quotes /
//      newlines / commas survives the round trip.

const log = getLogger('analytics.batcher')

interface BatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

// Column order is wire-significant — `COPY (col1, col2, ...) FROM
// STDIN` parses positional CSV, so this list MUST match the order
// `csvRow()` emits below and the column types declared on the
// Drizzle `accessLog` table (`@/server/db/schema.ts`). The compile-
// time pairing lives in `csvRow()`'s exhaustive destructure.
const COPY_COLUMNS = [
  'ts',
  'visitor_hash',
  'session_id',
  'ip',
  'path',
  'entity_type',
  'entity_id',
  'referer',
  'referer_host',
  'country',
  'region',
  'city',
  'latitude',
  'longitude',
  'timezone',
  'language',
  'ua',
  'browser',
  'browser_version',
  'os',
  'os_version',
  'device',
  'device_type',
  'is_bot',
] as const

class AccessLogBatcher {
  private buffer: EnrichedAccessEvent[] = []
  private timer: NodeJS.Timeout | null = null
  private flushing: Promise<void> | null = null

  constructor(private readonly opts: BatcherOptions) {
    registerShutdownHook(() => this.flush())
  }

  push(event: EnrichedAccessEvent): void {
    this.buffer.push(event)

    if (this.buffer.length >= this.opts.flushThreshold) {
      void this.flush()
      return
    }

    if (this.timer === null) {
      this.timer = setTimeout(() => {
        void this.flush()
      }, this.opts.flushIntervalMs)
      this.timer.unref?.()
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      return this.flushing
    }
    if (this.buffer.length === 0) {
      return
    }

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const snapshot = this.buffer
    this.buffer = []

    this.flushing = (async () => {
      try {
        await copyEvents(snapshot)
        log.debug('flushed access log', { count: snapshot.length })
      } catch (err) {
        log.error('flush failed; dropping batch', {
          err: err instanceof Error ? err.message : String(err),
          count: snapshot.length,
        })
        // Deliberately NOT restoring the snapshot to the buffer:
        // unlike counter increments (where losing N bumps is just
        // a counter undershoot), access-log rows are append-only
        // analytics and the most common failure mode is a malformed
        // row that would re-throw on every retry. Drop the batch
        // and continue serving live traffic. A future revision can
        // route failed batches to a dead-letter table if the data
        // volume justifies the complexity.
      } finally {
        this.flushing = null
      }
    })()

    return this.flushing
  }
}

async function copyEvents(events: EnrichedAccessEvent[]): Promise<void> {
  const pool = getRawPool()
  const client = await pool.connect()
  try {
    const sql = `COPY access_log (${COPY_COLUMNS.join(', ')}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`
    const stream = client.query(copyFrom(sql))
    const source = Readable.from(events.map(csvRow))
    await pipeline(source, stream)
  } finally {
    client.release()
  }
}

// CSV escaper compatible with Postgres' `COPY ... WITH (FORMAT csv,
// NULL '\N')`. `null`/`undefined` columns become `\N`; everything else
// is stringified and quoted iff it contains a delimiter (comma) or a
// CSV-special character (quote / newline / carriage return). Embedded
// quotes are doubled. Returns a single line terminated by `\n` so the
// upstream `Readable.from(events.map(csvRow))` can fan rows through
// the COPY stream one at a time.
export function csvRow(e: EnrichedAccessEvent): string {
  const cols = [
    e.ts.toISOString(),
    e.visitorHash,
    e.sessionId,
    e.ip,
    e.path,
    e.entityType,
    e.entityId === null ? null : e.entityId.toString(),
    e.referer,
    e.refererHost,
    e.country,
    e.region,
    e.city,
    e.latitude === null ? null : e.latitude.toString(),
    e.longitude === null ? null : e.longitude.toString(),
    e.timezone,
    e.language,
    e.ua,
    e.browser,
    e.browserVersion,
    e.os,
    e.osVersion,
    e.device,
    e.deviceType,
    e.isBot ? 't' : 'f',
  ]
  return cols.map(csvEscape).join(',') + '\n'
}

export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '\\N'
  }
  const str = typeof value === 'string' ? value : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

import { getOrCreateGlobalSingleton } from '@/server/infra/global-singleton'

const GLOBAL_KEY = Symbol.for('yufan.me/analytics-batcher')

function getBatcher(): AccessLogBatcher {
  return getOrCreateGlobalSingleton(
    GLOBAL_KEY,
    () =>
      new AccessLogBatcher({
        flushIntervalMs: 1000,
        flushThreshold: 100,
      }),
  )
}

export function pushAccessEvent(event: EnrichedAccessEvent): void {
  getBatcher().push(event)
}

export function flushAccessLog(): Promise<void> {
  return getBatcher().flush()
}
