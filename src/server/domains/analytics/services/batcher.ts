import { type DuckDBConnection } from '@duckdb/node-api'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { appendAccessEvents } from '@/server/domains/analytics/services/access-log'
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

function deserializeFromDeadLetter(line: string): EnrichedAccessEvent | null {
  return deserializeDeadLetterJsonLine(line, (raw) => {
    raw.ts = new Date(unsafeCast<number>(raw.ts))
    return unsafeCast<EnrichedAccessEvent>(raw)
  })
}

// The DuckDB writer is injected by the composition root at import time —
// a direct import would invert the dependency direction (domain →
// composition root).
let resolveWriter: (() => DuckDBConnection) | null = null

export function wireAccessLogBatcher(deps: { getWriter: () => DuckDBConnection }): void {
  resolveWriter = deps.getWriter
}

function requireWriter(): DuckDBConnection {
  if (resolveWriter === null) {
    throw new Error('AccessLogBatcher used before wireAccessLogBatcher')
  }
  return resolveWriter()
}

// The writer getter is lazy: the sidecar opens AFTER the batchers
// register, so the connection resolves at flush time, never at construction.
class AccessLogBatcher extends InsertBatcher<EnrichedAccessEvent, DuckDBConnection> {
  constructor() {
    super({ flushIntervalMs: 1000, flushThreshold: 100 }, 'analytics.batcher', requireWriter)
  }

  protected async insertBatch(writer: DuckDBConnection, events: EnrichedAccessEvent[]): Promise<void> {
    await appendAccessEvents(writer, events)
  }

  protected async onInsertFailed(events: EnrichedAccessEvent[]): Promise<FlushResult> {
    await writeDeadLetter(events, serializeDeadLetterJsonLines, deadLetterPath(), this.log)
    return { committed: 0, deadLettered: events.length }
  }
}

// Self-register on the infra batching seam so the bootstrap lifecycle
// drives init/flush/reset/replay through the registry.
registerBatcher(BATCHER_NAME, () => new AccessLogBatcher(), {
  replayDeadLetter: () => replayDeadLetterAccessLog(),
})

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
