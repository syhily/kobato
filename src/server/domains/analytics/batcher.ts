import type { Pool } from 'pg'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { csvEscape } from '@/server/infra/csv'
import { CopyBatcher, replayDeadLetter as replayFromInfra, writeDeadLetter } from '@/server/infra/db/copy-batcher'
import { ANALYTICS_DEAD_LETTER_PATH } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'
import { safeBigInt } from '@/shared/utils/tools'

export { csvEscape }

const DEAD_LETTER_SEP = '\n'

function deadLetterPath(): string {
  return ANALYTICS_DEAD_LETTER_PATH ?? '/tmp/kobato-access-log-dead-letter.jsonl'
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
    const raw = JSON.parse(line) as Record<string, unknown>
    return {
      ts: new Date(raw.ts as string),
      visitorHash: raw.visitorHash as string,
      sessionId: raw.sessionId as string | null,
      ip: raw.ip as string | null,
      path: raw.path as string,
      entityType: raw.entityType as 'post' | 'page' | null,
      entityId: raw.entityId === null ? null : safeBigInt(raw.entityId as string),
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

  protected async onCopyFailed(events: EnrichedAccessEvent[]): Promise<void> {
    await writeDeadLetter(events, serializeForDeadLetter, deadLetterPath(), this.log)
  }
}

let batcher: AccessLogBatcher | undefined

function getBatcher(pool?: Pool): AccessLogBatcher {
  if (batcher === undefined) {
    if (pool === undefined) {
      throw new Error('AccessLogBatcher must be initialized with a pool')
    }
    batcher = new AccessLogBatcher(pool)
  }
  return batcher
}

export function resetAccessLogBatcher(): void {
  batcher = undefined
}

export function initAccessLogBatcher(pool: Pool): void {
  getBatcher(pool)
}

export function pushAccessEvent(event: EnrichedAccessEvent, pool?: Pool): void {
  getBatcher(pool).push(event)
}

export function flushAccessLog(pool?: Pool): Promise<void> {
  return getBatcher(pool).flush()
}

/** @deprecated Use replayDeadLetterAccessLog */
export const replayDeadLetter = replayDeadLetterAccessLog

export async function replayDeadLetterAccessLog(
  pool: Pool,
  path?: string,
): Promise<{ replayed: number; failed: number }> {
  return replayFromInfra(
    path ?? deadLetterPath(),
    deserializeFromDeadLetter,
    async (events) => getBatcher(pool).ingest(events),
    getLogger('analytics.batcher'),
  )
}
