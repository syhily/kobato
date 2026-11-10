import { type DuckDBConnection } from '@duckdb/node-api'
import { randomUUID } from 'node:crypto'

import type { DeviceEnvServerRow } from '@/server/domains/analytics/services/device-env'
import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'

import { appendAccessEvents } from '@/server/domains/analytics/services/access-log'
import { appendDeviceEnvServerRows } from '@/server/domains/analytics/services/device-env'
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

/** One event plus its device-environment sidecar row — written in the same flush. */
export interface AccessLogItem {
  event: EnrichedAccessEvent
  /** NULL only for legacy flat dead-letter rows. */
  envServer: DeviceEnvServerRow | null
}

function deadLetterPath(): string {
  return ANALYTICS_DEAD_LETTER_PATH
}

function reviveEventTimestamp(raw: Record<string, unknown>): EnrichedAccessEvent {
  const event = unsafeCast<EnrichedAccessEvent>(raw)
  event.ts = new Date(unsafeCast<number>(event.ts))
  return event
}

function deserializeFromDeadLetter(line: string): AccessLogItem | null {
  return deserializeDeadLetterJsonLine(line, (raw) => {
    if (typeof raw.event === 'object' && raw.event !== null) {
      const item = unsafeCast<AccessLogItem>(raw)
      item.event.ts = new Date(unsafeCast<number>(item.event.ts))
      if (item.envServer !== null) {
        item.envServer.timestamp = new Date(unsafeCast<number>(item.envServer.timestamp))
      }
      return item
    }
    // Legacy flat-event line: the original id was never persisted, so mint a
    // fresh one and skip the sidecar row that never existed.
    const event = reviveEventTimestamp(raw)
    event.eventId = randomUUID()
    return { event, envServer: null }
  })
}

// The DuckDB writer is injected by the composition root — importing it directly
// would invert the dependency direction (domain → composition root).
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

// The writer getter is lazy: the sidecar opens AFTER the batchers register, so
// the connection resolves at flush time, never at construction.
class AccessLogBatcher extends InsertBatcher<AccessLogItem, DuckDBConnection> {
  constructor() {
    super({ flushIntervalMs: 1000, flushThreshold: 100 }, 'analytics.batcher', requireWriter)
  }

  protected async insertBatch(writer: DuckDBConnection, items: AccessLogItem[]): Promise<void> {
    await appendAccessEvents(
      writer,
      items.map((item) => item.event),
    )
    const envRows = items.flatMap((item) => (item.envServer === null ? [] : [item.envServer]))
    if (envRows.length > 0) {
      await appendDeviceEnvServerRows(writer, envRows)
    }
  }

  protected async onInsertFailed(items: AccessLogItem[]): Promise<FlushResult> {
    await writeDeadLetter(items, serializeDeadLetterJsonLines, deadLetterPath(), this.log)
    return { committed: 0, deadLettered: items.length }
  }
}

registerBatcher(BATCHER_NAME, () => new AccessLogBatcher(), {
  replayDeadLetter: () => replayDeadLetterAccessLog(),
})

export function pushAccessEvent(item: AccessLogItem): void {
  requireBatcher<AccessLogBatcher>(BATCHER_NAME).push(item)
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
    (items) => batcher.ingest(items),
    getLogger('analytics.batcher'),
  )
}
