import type { EnrichedAccessEvent } from '@kobato/db/duckdb/access-events'
import type { AnalyticsWriter } from '@kobato/db/duckdb/connection'
import type { DeviceEnvServerRow } from '@kobato/db/duckdb/device-env'

import { appendAccessEvents } from '@kobato/db/duckdb/access-events'
import { appendDeviceEnvServerRows } from '@kobato/db/duckdb/device-env'
import { ANALYTICS_DEAD_LETTER_PATH } from '@kobato/server/infra/data-paths'
import { getBatcher, registerBatcher, requireBatcher } from '@kobato/server/infra/db/batcher-registry'
import {
  deserializeDeadLetterJsonLine,
  type FlushResult,
  InsertBatcher,
  replayDeadLetter as replayFromInfra,
  serializeDeadLetterJsonLines,
  writeDeadLetter,
} from '@kobato/server/infra/db/insert-batcher'
import { getLogger } from '@kobato/server/infra/logger'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { randomUUID } from 'node:crypto'

const BATCHER_NAME = 'AccessLogBatcher'

export interface AccessLogItem {
  event: EnrichedAccessEvent
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
    const event = reviveEventTimestamp(raw)
    event.eventId = randomUUID()
    return { event, envServer: null }
  })
}

let resolveWriter: (() => AnalyticsWriter) | null = null

export function wireAccessLogBatcher(deps: { getWriter: () => AnalyticsWriter }): void {
  resolveWriter = deps.getWriter
}

function requireWriter(): AnalyticsWriter {
  if (resolveWriter === null) {
    throw new Error('AccessLogBatcher used before wireAccessLogBatcher')
  }
  return resolveWriter()
}

class AccessLogBatcher extends InsertBatcher<AccessLogItem, AnalyticsWriter> {
  constructor() {
    super({ flushIntervalMs: 1000, flushThreshold: 100 }, 'analytics.batcher', requireWriter)
  }

  protected async insertBatch(writer: AnalyticsWriter, items: AccessLogItem[]): Promise<void> {
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
