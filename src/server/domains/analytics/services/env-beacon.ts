import { type DuckDBConnection } from '@duckdb/node-api'

import type { DeviceEnvClientRow } from '@/server/domains/analytics/services/device-env'
import type { DeviceEnvBeacon } from '@/shared/contracts/analytics'

import { appendDeviceEnvClientRows } from '@/server/domains/analytics/services/device-env'
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
import { ANALYTICS_ENV_DEAD_LETTER_PATH } from '@/server/infra/paths'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// The device-environment beacon side (`device_env_client`): the client
// beacon arrives seconds after the server-side event row, so it is a pure
// append into its own table, joined at query time by `event_id`. The id is
// NOT validated against `access_events`: a bot-gated or direct-POST id
// simply yields an orphan row, which the queries' JOIN drops and retention
// clears in the same 180-day window.

const BATCHER_NAME = 'DeviceEnvBeaconBatcher'

function deadLetterPath(): string {
  return ANALYTICS_ENV_DEAD_LETTER_PATH
}

/** Map the wire beacon onto its sidecar row; absent fields become NULL / ''. */
export function toDeviceEnvClientRow(beacon: DeviceEnvBeacon, receivedAt: Date = new Date()): DeviceEnvClientRow {
  return {
    eventId: beacon.eventId,
    timestamp: receivedAt,
    screenW: beacon.screenW ?? null,
    screenH: beacon.screenH ?? null,
    availW: beacon.availW ?? null,
    availH: beacon.availH ?? null,
    viewportW: beacon.viewportW ?? null,
    viewportH: beacon.viewportH ?? null,
    dpr: beacon.dpr ?? null,
    colorDepth: beacon.colorDepth ?? null,
    touchPoints: beacon.touchPoints ?? null,
    pointer: beacon.pointer ?? '',
    hover: beacon.hover ?? '',
    colorScheme: beacon.colorScheme ?? '',
    reducedMotion: beacon.reducedMotion ?? null,
    netEffectiveType: beacon.netEffectiveType ?? '',
    netDownlink: beacon.netDownlink ?? null,
    netRtt: beacon.netRtt ?? null,
    netSaveData: beacon.netSaveData ?? null,
    locale: beacon.locale ?? '',
    timezone: beacon.timezone ?? '',
    hardwareConcurrency: beacon.hardwareConcurrency ?? null,
    deviceMemory: beacon.deviceMemory ?? null,
    hasStatic: beacon.hasStatic,
  }
}

function deserializeFromDeadLetter(line: string): DeviceEnvClientRow | null {
  return deserializeDeadLetterJsonLine(line, (raw) => {
    const row = unsafeCast<DeviceEnvClientRow>(raw)
    row.timestamp = new Date(unsafeCast<number>(row.timestamp))
    return row
  })
}

// The DuckDB writer is injected by the composition root at import time —
// a direct import would invert the dependency direction (domain →
// composition root).
let resolveWriter: (() => DuckDBConnection) | null = null

export function wireDeviceEnvBeaconBatcher(deps: { getWriter: () => DuckDBConnection }): void {
  resolveWriter = deps.getWriter
}

function requireWriter(): DuckDBConnection {
  if (resolveWriter === null) {
    throw new Error('DeviceEnvBeaconBatcher used before wireDeviceEnvBeaconBatcher')
  }
  return resolveWriter()
}

/**
 * Beacons are duplicates by nature: navigation back/forward re-fires an old
 * event id, StrictMode's dev double-effect sends twice, and dead-letter
 * replay can re-send a batch that partially landed. `event_id` is the PK, so
 * one duplicate would poison the WHOLE appender batch (and its replay) — so
 * filter against the table (and within the batch) before appending. The
 * single writer connection serializes these statements with the append.
 */
async function filterAlreadyStored(
  writer: DuckDBConnection,
  rows: DeviceEnvClientRow[],
): Promise<DeviceEnvClientRow[]> {
  if (rows.length === 0) {
    return rows
  }
  const uniqueIds = [...new Set(rows.map((row) => row.eventId))]
  const placeholders = uniqueIds.map(() => '?').join(', ')
  const result = await writer.runAndReadAll(
    `SELECT event_id::VARCHAR AS id FROM device_env_client WHERE event_id IN (${placeholders})`,
    uniqueIds,
  )
  const stored = new Set(result.getRowObjects().map((row) => String(row.id)))

  const fresh: DeviceEnvClientRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (stored.has(row.eventId) || seen.has(row.eventId)) {
      continue
    }
    seen.add(row.eventId)
    fresh.push(row)
  }
  return fresh
}

// Lazy writer getter: the sidecar opens AFTER the batchers register, so the
// connection resolves at flush time, never at construction.
class DeviceEnvBeaconBatcher extends InsertBatcher<DeviceEnvClientRow, DuckDBConnection> {
  constructor() {
    super({ flushIntervalMs: 1000, flushThreshold: 100 }, 'analytics.env-beacon', requireWriter)
  }

  protected async insertBatch(writer: DuckDBConnection, rows: DeviceEnvClientRow[]): Promise<void> {
    const fresh = await filterAlreadyStored(writer, rows)
    if (fresh.length === 0) {
      return
    }
    await appendDeviceEnvClientRows(writer, fresh)
  }

  protected async onInsertFailed(rows: DeviceEnvClientRow[]): Promise<FlushResult> {
    await writeDeadLetter(rows, serializeDeadLetterJsonLines, deadLetterPath(), this.log)
    return { committed: 0, deadLettered: rows.length }
  }
}

// Self-register on the infra batching seam so the bootstrap lifecycle
// drives init/flush/reset/replay through the registry.
registerBatcher(BATCHER_NAME, () => new DeviceEnvBeaconBatcher(), {
  replayDeadLetter: () => replayDeadLetterDeviceEnv(),
})

export function pushDeviceEnvBeacon(beacon: DeviceEnvBeacon): void {
  requireBatcher<DeviceEnvBeaconBatcher>(BATCHER_NAME).push(toDeviceEnvClientRow(beacon))
}

export function flushDeviceEnvBeacons(): Promise<FlushResult> {
  const batcher = getBatcher<DeviceEnvBeaconBatcher>(BATCHER_NAME)
  if (!batcher) {
    return Promise.resolve({ committed: 0, deadLettered: 0 })
  }
  return batcher.flush()
}

export async function replayDeadLetterDeviceEnv(path?: string): Promise<{ replayed: number; failed: number }> {
  const batcher = requireBatcher<DeviceEnvBeaconBatcher>(BATCHER_NAME)
  return replayFromInfra(
    path ?? deadLetterPath(),
    deserializeFromDeadLetter,
    (rows) => batcher.ingest(rows),
    getLogger('analytics.env-beacon'),
  )
}
