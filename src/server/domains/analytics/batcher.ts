import { appendFile, readFile, rename, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { from as copyFrom } from 'pg-copy-streams'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { pool } from '@/server/infra/db/pool'
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
  deadLetterPath?: string
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
        log.error('flush failed; writing to dead-letter', {
          err: err instanceof Error ? err.message : String(err),
          count: snapshot.length,
        })
        await writeDeadLetter(snapshot, this.opts.deadLetterPath)
      } finally {
        this.flushing = null
      }
    })()

    return this.flushing
  }
}

async function copyEvents(events: EnrichedAccessEvent[]): Promise<void> {
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

let batcher: AccessLogBatcher | undefined

function getBatcher(): AccessLogBatcher {
  if (batcher === undefined) {
    batcher = new AccessLogBatcher({
      flushIntervalMs: 1000,
      flushThreshold: 100,
    })
  }
  return batcher
}

export function resetAccessLogBatcher(): void {
  batcher = undefined
}

export function pushAccessEvent(event: EnrichedAccessEvent): void {
  getBatcher().push(event)
}

export function flushAccessLog(): Promise<void> {
  return getBatcher().flush()
}

// ─── dead-letter ──────────────────────────────────────────
//
// When COPY fails (transient network error, Postgres restart,
// malformed row, etc.) the failed batch is serialized as one
// JSON line per event and appended to a local JSONL file. A
// separate `replayDeadLetter()` call can re-ingest the file
// once the failure is resolved.

const DEAD_LETTER_SEP = '\n'

function deadLetterPath(): string {
  return process.env.ANALYTICS_DEAD_LETTER_PATH ?? '/tmp/yufan-access-log-dead-letter.jsonl'
}

function serializeForDeadLetter(events: EnrichedAccessEvent[]): string {
  return (
    events
      .map((e) =>
        JSON.stringify({
          ...e,
          ts: e.ts.toISOString(),
          entityId: e.entityId === null ? null : e.entityId.toString(),
        }),
      )
      .join(DEAD_LETTER_SEP) + DEAD_LETTER_SEP
  )
}

async function writeDeadLetter(events: EnrichedAccessEvent[], path?: string): Promise<void> {
  const target = path ?? deadLetterPath()
  try {
    await appendFile(target, serializeForDeadLetter(events), 'utf-8')
    log.info('wrote dead-letter batch', { path: target, count: events.length })
  } catch (writeErr) {
    // If even the dead-letter write fails, we've done everything we can.
    log.error('dead-letter write also failed', {
      err: writeErr instanceof Error ? writeErr.message : String(writeErr),
      count: events.length,
    })
  }
}

function deserializeFromDeadLetter(line: string): EnrichedAccessEvent | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>
    return {
      ts: new Date(raw.ts as string),
      visitorHash: raw.visitorHash as string,
      sessionId: raw.sessionId as string | null,
      ip: raw.ip as string | null,
      path: raw.path as string,
      entityType: raw.entityType as 'post' | 'page' | null,
      entityId: raw.entityId === null ? null : BigInt(raw.entityId as string),
      referer: raw.referer as string | null,
      refererHost: raw.refererHost as string | null,
      country: raw.country as string | null,
      region: raw.region as string | null,
      city: raw.city as string | null,
      latitude: raw.latitude as number | null,
      longitude: raw.longitude as number | null,
      timezone: raw.timezone as string | null,
      language: raw.language as string | null,
      ua: raw.ua as string | null,
      browser: raw.browser as string | null,
      browserVersion: raw.browserVersion as string | null,
      os: raw.os as string | null,
      osVersion: raw.osVersion as string | null,
      device: raw.device as string | null,
      deviceType: raw.deviceType as string | null,
      isBot: raw.isBot as boolean,
    }
  } catch {
    return null
  }
}

export async function replayDeadLetter(path?: string): Promise<{ replayed: number; failed: number }> {
  const target = path ?? deadLetterPath()
  let content: string
  try {
    content = await readFile(target, 'utf-8')
  } catch {
    log.info('no dead-letter file to replay', { path: target })
    return { replayed: 0, failed: 0 }
  }

  const lines = content.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) {
    return { replayed: 0, failed: 0 }
  }

  const events: EnrichedAccessEvent[] = []
  let failed = 0
  for (const line of lines) {
    const event = deserializeFromDeadLetter(line)
    if (event !== null) {
      events.push(event)
    } else {
      failed++
    }
  }

  if (events.length > 0) {
    try {
      await copyEvents(events)
      log.info('replayed dead-letter batch', { count: events.length, path: target })
      // Truncate the file on successful replay (atomic rename).
      const tmp = `${target}.replayed`
      await writeFile(tmp, '', 'utf-8')
      await rename(tmp, target)
    } catch (err) {
      log.error('dead-letter replay also failed; keeping file', {
        err: err instanceof Error ? err.message : String(err),
        count: events.length,
        path: target,
      })
      failed += events.length
    }
  }

  return { replayed: events.length - (failed > 0 ? 0 : 0), failed }
}
