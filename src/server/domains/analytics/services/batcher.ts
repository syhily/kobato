import { DuckDBTimestampMillisecondsValue } from '@duckdb/node-api'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'
import type { Database } from '@/server/infra/db/database'

import { getAnalyticsHandle } from '@/server/bootstrap/analytics-lifecycle'
import { getBatcher, registerBatcher, requireBatcher } from '@/server/infra/db/batcher-registry'
import {
  type FlushResult,
  InsertBatcher,
  replayDeadLetter as replayFromInfra,
  writeDeadLetter,
} from '@/server/infra/db/insert-batcher'
import { getLogger } from '@/server/infra/logger'
import { ANALYTICS_DEAD_LETTER_PATH } from '@/server/infra/paths'
import { toJsonSafe } from '@/shared/utils/to-json-safe'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const BATCHER_NAME = 'AccessLogBatcher'

const DEAD_LETTER_SEP = '\n'

function deadLetterPath(): string {
  return ANALYTICS_DEAD_LETTER_PATH
}

// Dead-letter wire format: one plain-JSON object per line (Dates as
// epoch ms via `toJsonSafe` — superjson was dropped with the migration).
function serializeForDeadLetter(events: EnrichedAccessEvent[]): string {
  return events.map((e) => JSON.stringify(toJsonSafe(e))).join(DEAD_LETTER_SEP) + DEAD_LETTER_SEP
}

function deserializeFromDeadLetter(line: string): EnrichedAccessEvent | null {
  try {
    const raw = unsafeCast<Record<string, unknown>>(JSON.parse(line))
    raw.ts = new Date(unsafeCast<number>(raw.ts))
    return unsafeCast<EnrichedAccessEvent>(raw)
  } catch {
    return null
  }
}

// DuckDB Appender protocol (prototype-learned): `endRow()` terminates
// every row, `flushSync()` lands a chunk (≤ 2048 rows), `closeSync()`
// commits the tail. Flushes are ~62k rows/s — 9× prepared INSERTs.
class AccessLogBatcher extends InsertBatcher<EnrichedAccessEvent> {
  constructor(db: Database) {
    super({ flushIntervalMs: 1000, flushThreshold: 100 }, 'analytics.batcher', db)
  }

  protected async insertBatch(_db: Database, events: EnrichedAccessEvent[]): Promise<void> {
    const appender = await getAnalyticsHandle().writer.createAppender('access_log')
    let count = 0
    for (const e of events) {
      appender.appendTimestampMilliseconds(new DuckDBTimestampMillisecondsValue(BigInt(e.ts.getTime())))
      const s = (v: string | null) => (v === null ? appender.appendNull() : appender.appendVarchar(v))
      s(e.visitorHash)
      s(e.sessionId)
      s(e.ip)
      s(e.path)
      s(e.entityType)
      if (e.entityId === null) {
        appender.appendNull()
      } else {
        appender.appendBigInt(BigInt(e.entityId))
      }
      s(e.referer)
      s(e.refererHost)
      s(e.country)
      s(e.region)
      s(e.city)
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
      s(e.timezone)
      s(e.language)
      s(e.ua)
      s(e.browser)
      s(e.browserVersion)
      s(e.os)
      s(e.osVersion)
      s(e.device)
      s(e.deviceType)
      appender.appendBoolean(e.isBot)
      appender.endRow()
      count++
      if (count % 2048 === 0) {
        appender.flushSync()
      }
    }
    appender.closeSync()
  }

  protected async onInsertFailed(events: EnrichedAccessEvent[]): Promise<FlushResult> {
    await writeDeadLetter(events, serializeForDeadLetter, deadLetterPath(), this.log)
    return { committed: 0, deadLettered: events.length }
  }
}

// Self-register on the infra batching seam: the bootstrap lifecycle
// drives init/flush/reset through the registry (`initAllBatchers` /
// `flushAllBatchers` / `resetAllBatchers`) with no per-domain calls.
registerBatcher(BATCHER_NAME, (handle) => new AccessLogBatcher(handle.db))

export function pushAccessEvent(event: EnrichedAccessEvent): void {
  requireBatcher<AccessLogBatcher>(BATCHER_NAME).push(event)
}

export function flushAccessLog(): Promise<FlushResult> {
  const batcher = getBatcher<AccessLogBatcher>(BATCHER_NAME)
  if (!batcher) {
    return Promise.resolve({ committed: 0, deadLettered: 0 })
  }
  return batcher.flush()
}

export async function replayDeadLetterAccessLog(path?: string): Promise<{ replayed: number; failed: number }> {
  const batcher = requireBatcher<AccessLogBatcher>(BATCHER_NAME)
  return replayFromInfra(
    path ?? deadLetterPath(),
    deserializeFromDeadLetter,
    (events) => batcher.ingest(events),
    getLogger('analytics.batcher'),
  )
}
