import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'
import type { DatabaseHandle } from '@/server/infra/db/database'

import { closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { closeTestDatabase, createTestDatabase } from '#/_helpers/integration-db'

const logs = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    info: logs.info,
    warn: logs.warn,
    error: logs.error,
    debug: logs.debug,
    child: vi.fn(function (this: unknown) {
      return this
    }),
  })),
  root: logs,
}))

import { runAccessLogRetention } from '@/server/domains/analytics/services/maintenance'
import { runDbMaintenance } from '@/server/infra/db/maintenance'

function pragmaNumber(handle: DatabaseHandle, pragma: string): number {
  const row = handle.client.prepare(`PRAGMA ${pragma}`).get()
  const value = row === undefined ? undefined : Object.values(row)[0]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

// ─── SQLite (content DB) ─────────────────────────────────

const handle = createTestDatabase()

afterAll(() => {
  closeTestDatabase(handle)
})

beforeEach(() => {
  vi.clearAllMocks()
  handle.client.exec('DROP TABLE IF EXISTS maintenance_probe')
})

describe('db maintenance — SQLite freelist drain (plan §1.11)', () => {
  it('drains the freelist and logs page stats before and after', () => {
    // Build freelist pages: write ~1 MB of rows, then delete them.
    // auto_vacuum=INCREMENTAL moves freed pages onto the freelist but
    // only `PRAGMA incremental_vacuum` reclaims them.
    handle.client.exec('CREATE TABLE maintenance_probe (id INTEGER PRIMARY KEY, payload TEXT)')
    const payload = 'x'.repeat(4096)
    const insert = handle.client.prepare('INSERT INTO maintenance_probe (payload) VALUES (?)')
    for (let i = 0; i < 256; i++) {
      insert.run(payload)
    }
    handle.client.exec('DELETE FROM maintenance_probe')
    const freelistBefore = pragmaNumber(handle, 'freelist_count')
    expect(freelistBefore).toBeGreaterThan(0)

    runDbMaintenance(handle)

    expect(pragmaNumber(handle, 'freelist_count')).toBeLessThan(freelistBefore)
    expect(logs.info).toHaveBeenCalledWith(
      'database maintenance completed',
      expect.objectContaining({
        pagesBefore: expect.any(Number),
        pagesAfter: expect.any(Number),
        freelistBefore,
        freelistAfter: expect.any(Number),
      }),
    )
  })
})

// ─── DuckDB (analytics sidecar) ──────────────────────────

describe('db maintenance — DuckDB retention + checkpoint (plan §1.11)', () => {
  let analyticsHandle: AnalyticsHandle

  beforeEach(async () => {
    analyticsHandle = await createTestAnalyticsDb()
  })

  afterAll(async () => {
    // Handles are tracked by the helper and closed wholesale.
  })

  it('deletes rows past the 180-day retention, keeps recent rows, logs counts and file sizes', async () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
    const recent = new Date()
    await seedAccessEvents(analyticsHandle, [
      { ts: old, path: '/old', visitorHash: 'old-visitor' },
      { ts: recent, path: '/recent', visitorHash: 'recent-visitor' },
    ])

    await runAccessLogRetention(analyticsHandle)

    const result = await analyticsHandle.reader.runAndReadAll('SELECT path FROM access_log ORDER BY path')
    const paths = result.getRowObjects().map((row) => row.path)
    expect(paths).toEqual(['/recent'])
    expect(logs.info).toHaveBeenCalledWith(
      'analytics maintenance completed',
      expect.objectContaining({
        retentionDays: 180,
        rowsBefore: 2n,
        rowsAfter: 1n,
        // File-backed handle → real file sizes logged (null on :memory:).
        bytesBefore: expect.any(Number),
        bytesAfter: expect.any(Number),
      }),
    )

    await closeTestAnalyticsDb(analyticsHandle)
  })
})
