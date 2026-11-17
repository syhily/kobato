import type { DatabaseHandle } from '@kobato/db/database.ts'

import { jobRun } from '@kobato/db/schema/job-run.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { runDbMaintenance } from '@kobato/server/infra/db/maintenance.ts'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The SQLite half of the daily DB maintenance job. The DuckDB retention half
// lives in packages/db/tests/it/duckdb/maintenance.test.ts.

function pragmaNumber(handle: DatabaseHandle, pragma: string): number {
  const row = handle.client.prepare(`PRAGMA ${pragma}`).get()
  const value = row === undefined ? undefined : Object.values(row)[0]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

const handle = getDatabaseHandle()

beforeEach(() => {
  vi.clearAllMocks()
  __clearLogCaptureForTests()
  handle.client.exec('DROP TABLE IF EXISTS maintenance_probe')
})

describe('db maintenance — SQLite freelist drain (plan §1.11)', () => {
  it('drains the freelist and logs page stats before and after', () => {
    // auto_vacuum=INCREMENTAL leaves freed pages on the freelist; only incremental_vacuum reclaims them.
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
    expect(__logCaptureForTests()).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'database maintenance completed',
        ctx: expect.objectContaining({
          pagesBefore: expect.any(Number),
          pagesAfter: expect.any(Number),
          freelistBefore,
          freelistAfter: expect.any(Number),
        }),
      }),
    )
  })
})

describe('db maintenance — job_run history prune', () => {
  it('prunes job_run rows past the retention window and logs the count', () => {
    const db = handle.db
    db.delete(jobRun).run()
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    db.insert(jobRun).values({ taskKey: 'backup', trigger: 'scheduled', status: 'success', startedAt: old }).run()
    db.insert(jobRun)
      .values({ taskKey: 'backup', trigger: 'scheduled', status: 'success', startedAt: new Date() })
      .run()

    runDbMaintenance(handle)

    expect(db.select().from(jobRun).all()).toHaveLength(1)
    expect(__logCaptureForTests()).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'database maintenance completed',
        ctx: expect.objectContaining({ jobRunsPruned: 1 }),
      }),
    )
  })
})
