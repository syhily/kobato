import type { Pool } from 'pg'

import superjson from 'superjson'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { csvEscape } from '@/server/infra/csv'
import {
  type FlushResult,
  CopyBatcher,
  replayDeadLetter as replayFromInfra,
  writeDeadLetter,
} from '@/server/infra/db/copy-batcher'
import { ANALYTICS_DEAD_LETTER_PATH } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'

export { csvEscape }

const DEAD_LETTER_SEP = '\n'

function deadLetterPath(): string {
  return ANALYTICS_DEAD_LETTER_PATH ?? '/tmp/kobato-access-log-dead-letter.jsonl'
}

function serializeForDeadLetter(events: EnrichedAccessEvent[]): string {
  return events.map((e) => superjson.stringify(e)).join(DEAD_LETTER_SEP) + DEAD_LETTER_SEP
}

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

function deserializeFromDeadLetter(line: string): EnrichedAccessEvent | null {
  try {
    return superjson.parse<EnrichedAccessEvent>(line)
  } catch {
    return null
  }
}

// Column order is wire-significant — `COPY (col1, col2, ...) FROM
// STDIN` parses positional CSV, so this list MUST match the order
// `toCsvRow()` emits below and the column types declared on the
// Drizzle `accessLog` table (`@/server/db/schema.ts`).
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

class AccessLogBatcher extends CopyBatcher<EnrichedAccessEvent> {
  constructor(pool: Pool) {
    super({ flushIntervalMs: 1000, flushThreshold: 100 }, 'access_log', COPY_COLUMNS, 'analytics.batcher', pool)
  }

  protected toCsvRow(e: EnrichedAccessEvent): string {
    return csvRow(e)
  }

  protected async onCopyFailed(events: EnrichedAccessEvent[]): Promise<FlushResult> {
    await writeDeadLetter(events, serializeForDeadLetter, deadLetterPath(), this.log)
    return { committed: 0, deadLettered: events.length }
  }
}

let batcher: AccessLogBatcher | undefined

export function initAccessLogBatcher(pool: Pool): void {
  batcher = new AccessLogBatcher(pool)
}

export function resetAccessLogBatcher(): void {
  batcher = undefined
}

export function pushAccessEvent(event: EnrichedAccessEvent): void {
  if (!batcher) {
    throw new Error('AccessLogBatcher not initialized — call initAccessLogBatcher(pool) first')
  }
  batcher.push(event)
}

export function flushAccessLog(): Promise<FlushResult> {
  if (!batcher) {
    return Promise.resolve({ committed: 0, deadLettered: 0 })
  }
  return batcher.flush()
}

/** @deprecated Use replayDeadLetterAccessLog */
export const replayDeadLetter = replayDeadLetterAccessLog

export async function replayDeadLetterAccessLog(path?: string): Promise<{ replayed: number; failed: number }> {
  if (!batcher) {
    throw new Error('AccessLogBatcher not initialized — call initAccessLogBatcher(pool) first')
  }
  const b = batcher
  return replayFromInfra(
    path ?? deadLetterPath(),
    deserializeFromDeadLetter,
    async (events) => b.ingest(events),
    getLogger('analytics.batcher'),
  )
}
