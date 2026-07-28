import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'
import type { Database } from '@/server/infra/db/database'

import { getBatcher, registerBatcher, requireBatcher } from '@/server/infra/db/batcher-registry'
import {
  type FlushResult,
  InsertBatcher,
  replayDeadLetter as replayFromInfra,
  writeDeadLetter,
} from '@/server/infra/db/insert-batcher'
import { accessLog } from '@/server/infra/db/schema/config'
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

class AccessLogBatcher extends InsertBatcher<EnrichedAccessEvent> {
  constructor(db: Database) {
    super({ flushIntervalMs: 1000, flushThreshold: 100 }, 'analytics.batcher', db)
  }

  protected insertBatch(db: Database, events: EnrichedAccessEvent[]): void {
    db.insert(accessLog)
      .values(
        events.map((e) => ({
          ts: e.ts,
          visitorHash: e.visitorHash,
          sessionId: e.sessionId,
          ip: e.ip,
          path: e.path,
          entityType: e.entityType,
          entityId: e.entityId,
          referer: e.referer,
          refererHost: e.refererHost,
          country: e.country,
          region: e.region,
          city: e.city,
          latitude: e.latitude,
          longitude: e.longitude,
          timezone: e.timezone,
          language: e.language,
          ua: e.ua,
          browser: e.browser,
          browserVersion: e.browserVersion,
          os: e.os,
          osVersion: e.osVersion,
          device: e.device,
          deviceType: e.deviceType,
          isBot: e.isBot,
        })),
      )
      .run()
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
