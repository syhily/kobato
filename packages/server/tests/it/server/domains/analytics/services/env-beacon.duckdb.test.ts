import type { DeviceEnvBeacon } from '@kobato/api/contracts/admin/analytics'
import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'
import type { DatabaseHandle } from '@kobato/db/sqlite/database'

import { engineOf } from '@kobato/db/duckdb/connection'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import {
  flushDeviceEnvBeacons,
  pushDeviceEnvBeacon,
  replayDeadLetterDeviceEnv,
  toDeviceEnvClientRow,
} from '@kobato/server/domains/analytics/services/env-beacon'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { closeTestAnalyticsDb, createTestAnalyticsDb } from '@kobato/server/tests/utils/analytics-db'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const EVENT_ID = '00000000-0000-4000-8000-0000000000be'

function makeBeacon(overrides: Partial<DeviceEnvBeacon> = {}): DeviceEnvBeacon {
  return {
    eventId: EVENT_ID,
    hasStatic: true,
    screenW: 2560,
    dpr: 2,
    pointer: 'fine',
    colorScheme: 'dark',
    netEffectiveType: '4g',
    ...overrides,
  }
}

let analyticsHandle: AnalyticsHandle
let handle: DatabaseHandle

beforeEach(async () => {
  vi.clearAllMocks()
  await resetAllBatchers()
  if (analyticsHandle?.closed === false) {
    await closeTestAnalyticsDb(analyticsHandle)
  }
  handle = getDatabaseHandle()
  analyticsHandle = await createTestAnalyticsDb()
  __resetAnalyticsEngineForTests()
  __adoptAnalyticsHandleForTests(analyticsHandle)
  await engineOf(analyticsHandle).writer.run('DELETE FROM device_env_client')
  initAllBatchers(handle)
})

afterAll(async () => {
  await resetAllBatchers()
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

describe('toDeviceEnvClientRow', () => {
  it('maps absent fields to NULL / empty strings and keeps hasStatic', () => {
    const receivedAt = new Date('2026-01-01T00:00:00Z')
    expect(toDeviceEnvClientRow({ eventId: EVENT_ID, hasStatic: false }, receivedAt)).toEqual({
      eventId: EVENT_ID,
      timestamp: receivedAt,
      screenW: null,
      screenH: null,
      availW: null,
      availH: null,
      viewportW: null,
      viewportH: null,
      dpr: null,
      colorDepth: null,
      touchPoints: null,
      pointer: '',
      hover: '',
      colorScheme: '',
      reducedMotion: null,
      netEffectiveType: '',
      netDownlink: null,
      netRtt: null,
      netSaveData: null,
      locale: '',
      timezone: '',
      hardwareConcurrency: null,
      deviceMemory: null,
      hasStatic: false,
    })
  })
})

describe('DeviceEnvBeaconBatcher', () => {
  it('flushes an empty batch immediately', async () => {
    expect(await flushDeviceEnvBeacons()).toEqual({ committed: 0, deadLettered: 0 })
  })

  it('writes a beacon into device_env_client', async () => {
    pushDeviceEnvBeacon(makeBeacon())
    expect(await flushDeviceEnvBeacons()).toEqual({ committed: 1, deadLettered: 0 })

    const rows = await engineOf(analyticsHandle).reader.runAndReadAll(`
      SELECT
        event_id::VARCHAR AS eventId,
        screen_w AS screenW,
        dpr,
        pointer,
        color_scheme AS colorScheme,
        net_effective_type AS netEffectiveType,
        locale,
        has_static AS hasStatic
      FROM device_env_client
    `)
    expect(rows.getRowObjects()).toEqual([
      {
        eventId: EVENT_ID,
        screenW: 2560,
        dpr: 2,
        pointer: 'fine',
        colorScheme: 'dark',
        netEffectiveType: '4g',
        locale: '',
        hasStatic: true,
      },
    ])
  })

  it('drops duplicate event ids within one batch, keeping the first row', async () => {
    pushDeviceEnvBeacon(makeBeacon({ viewportW: 100 }))
    pushDeviceEnvBeacon(makeBeacon({ viewportW: 200 }))
    const result = await flushDeviceEnvBeacons()
    expect(result.deadLettered).toBe(0)

    const rows = await engineOf(analyticsHandle).reader.runAndReadAll(
      'SELECT event_id::VARCHAR AS eventId, viewport_w AS viewportW FROM device_env_client',
    )
    expect(rows.getRowObjects()).toEqual([{ eventId: EVENT_ID, viewportW: 100 }])
  })

  it('skips rows already stored and still appends the rest of the batch', async () => {
    const otherId = '00000000-0000-4000-8000-0000000000bf'
    pushDeviceEnvBeacon(makeBeacon({ viewportW: 100 }))
    await flushDeviceEnvBeacons()

    pushDeviceEnvBeacon(makeBeacon({ viewportW: 200 }))
    pushDeviceEnvBeacon(makeBeacon({ eventId: otherId, viewportW: 300 }))
    const result = await flushDeviceEnvBeacons()
    expect(result.deadLettered).toBe(0)

    const rows = await engineOf(analyticsHandle).reader.runAndReadAll(
      'SELECT event_id::VARCHAR AS eventId, viewport_w AS viewportW FROM device_env_client ORDER BY viewportW',
    )
    expect(rows.getRowObjects()).toEqual([
      { eventId: EVENT_ID, viewportW: 100 },
      { eventId: otherId, viewportW: 300 },
    ])
  })

  it('throws when pushing before initialization', () => {
    resetAllBatchers()
    expect(() => pushDeviceEnvBeacon(makeBeacon())).toThrow('not initialized')
  })

  it('replays its own dead-letter file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kobato-env-dead-letter-'))
    const path = join(dir, 'env-dead-letter.jsonl')
    const row = toDeviceEnvClientRow(makeBeacon(), new Date('2026-01-02T00:00:00Z'))
    writeFileSync(path, `${JSON.stringify({ ...row, timestamp: row.timestamp.getTime() })}\n`, 'utf-8')
    try {
      expect(await replayDeadLetterDeviceEnv(path)).toEqual({ replayed: 1, failed: 0 })
      await flushDeviceEnvBeacons()

      const rows = await engineOf(analyticsHandle).reader.runAndReadAll(
        'SELECT event_id::VARCHAR AS eventId, has_static AS hasStatic FROM device_env_client',
      )
      expect(rows.getRowObjects()).toEqual([{ eventId: EVENT_ID, hasStatic: true }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('treats a missing dead-letter file as a no-op', async () => {
    expect(await replayDeadLetterDeviceEnv('/nonexistent')).toEqual({ replayed: 0, failed: 0 })
  })
})
