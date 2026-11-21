import type { DeviceEnvBeacon } from '@kobato/api/contracts/analytics'
import type { DeviceEnvClientRow } from '@kobato/db/duckdb/device-env'

import { type DuckDBConnection } from '@duckdb/node-api'
import { appendDeviceEnvClientRows, existingDeviceEnvEventIds } from '@kobato/db/duckdb/device-env'
import { ANALYTICS_ENV_DEAD_LETTER_PATH } from '@kobato/server/infra/data-paths'
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

const BATCHER_NAME = 'DeviceEnvBeaconBatcher'

function deadLetterPath(): string {
  return ANALYTICS_ENV_DEAD_LETTER_PATH
}

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

async function filterAlreadyStored(
  writer: DuckDBConnection,
  rows: DeviceEnvClientRow[],
): Promise<DeviceEnvClientRow[]> {
  if (rows.length === 0) {
    return rows
  }
  const stored = await existingDeviceEnvEventIds(writer, [...new Set(rows.map((row) => row.eventId))])

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
