import { DuckDBTimestampMillisecondsValue, type DuckDBConnection } from '@duckdb/node-api'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { getAnalyticsHandle } from '@/server/bootstrap/analytics-lifecycle'
import { getBatcher, registerBatcher, requireBatcher } from '@/server/infra/db/batcher-registry'
import {
  deserializeDeadLetterJsonLine,
  type FlushResult,
  InsertBatcher,
  replayDeadLetter as replayFromInfra,
  serializeDeadLetterJsonLines,
  writeDeadLetter,
} from '@/server/infra/db/insert-batcher'
import { getLogger } from '@/server/infra/logger'
import { ANALYTICS_DEAD_LETTER_PATH } from '@/server/infra/paths'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const BATCHER_NAME = 'AccessLogBatcher'

function deadLetterPath(): string {
  return ANALYTICS_DEAD_LETTER_PATH
}

function serializeForDeadLetter(events: EnrichedAccessEvent[]): string {
  return serializeDeadLetterJsonLines(events)
}

function deserializeFromDeadLetter(line: string): EnrichedAccessEvent | null {
  return deserializeDeadLetterJsonLine(line, (raw) => {
    raw.ts = new Date(unsafeCast<number>(raw.ts))
    return unsafeCast<EnrichedAccessEvent>(raw)
  })
}

// DuckDB Appender protocol (prototype-learned): `endRow()` terminates
// every row, `flushSync()` lands a chunk (≤ 2048 rows), `closeSync()`
// commits the tail. Flushes are ~62k rows/s — 9× prepared INSERTs.
// The writer getter is lazy: the sidecar opens AFTER the batchers
// register (db-lifecycle order), so the connection resolves at flush
// time, never at construction.
class AccessLogBatcher extends InsertBatcher<EnrichedAccessEvent, DuckDBConnection> {
  constructor() {
    super({ flushIntervalMs: 1000, flushThreshold: 100 }, 'analytics.batcher', () => getAnalyticsHandle().writer)
  }

  protected async insertBatch(writer: DuckDBConnection, events: EnrichedAccessEvent[]): Promise<void> {
    const appender = await writer.createAppender('access_log')
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
registerBatcher(BATCHER_NAME, () => new AccessLogBatcher())

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
