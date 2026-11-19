import { ensureMetric, findMetricByTarget } from '@kobato/db/operations/metric.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

async function freshBatcher() {
  const mod = await import('@kobato/server/domains/analytics/services/pv-batcher.ts')
  resetAllBatchers()
  return mod
}

function failMetricUpdates(): void {
  db.run(sql`
    CREATE TEMP TRIGGER it_fail_metric_update
    BEFORE UPDATE ON metric
    BEGIN
      SELECT RAISE(ABORT, 'DB down');
    END
  `)
}

function healMetricUpdates(): void {
  db.run(sql`DROP TRIGGER IF EXISTS it_fail_metric_update`)
}

async function pvOf(type: 'post' | 'page', ownerId: number): Promise<number> {
  const row = await findMetricByTarget(db, { type, ownerId })
  return row?.pv ?? 0
}

describe('analytics/pv-batcher', () => {
  beforeEach(async () => {
    await clearAllTables(db)
  })

  afterEach(() => {
    healMetricUpdates()
    resetAllBatchers()
  })

  it('throws when bumpPageView is called before init', async () => {
    const { bumpPageView } = await freshBatcher()
    expect(() => bumpPageView({ type: 'post', ownerId: 1 })).toThrow('PageViewBatcher not initialized')
  })

  it('adds the snapshot back to the new buffer on flush failure (no double-count, no loss)', async () => {
    const { bumpPageView, flushPageViews } = await freshBatcher()
    initAllBatchers(getDatabaseHandle())
    await ensureMetric(db, { type: 'post', ownerId: 1 })
    await ensureMetric(db, { type: 'post', ownerId: 2 })

    failMetricUpdates()

    bumpPageView({ type: 'post', ownerId: 1 })
    bumpPageView({ type: 'post', ownerId: 1 })
    bumpPageView({ type: 'post', ownerId: 2 })

    const flushPromise = flushPageViews()

    bumpPageView({ type: 'post', ownerId: 1 })
    bumpPageView({ type: 'post', ownerId: 2 })

    await flushPromise

    expect(await pvOf('post', 1)).toBe(0)
    expect(await pvOf('post', 2)).toBe(0)

    healMetricUpdates()
    await flushPageViews()

    expect(await pvOf('post', 1)).toBe(3)
    expect(await pvOf('post', 2)).toBe(2)
  })

  it('clears the buffer after a successful flush', async () => {
    const { bumpPageView, flushPageViews } = await freshBatcher()
    initAllBatchers(getDatabaseHandle())
    await ensureMetric(db, { type: 'post', ownerId: 1 })

    bumpPageView({ type: 'post', ownerId: 1 })
    await flushPageViews()
    expect(await pvOf('post', 1)).toBe(1)

    await flushPageViews()
    expect(await pvOf('post', 1)).toBe(1)
  })

  it('reports the unflushed delta via pendingViewDelta, and zero after the flush lands', async () => {
    const { bumpPageView, flushPageViews, pendingViewDelta } = await freshBatcher()

    expect(pendingViewDelta({ type: 'post', ownerId: 1 })).toBe(0)

    initAllBatchers(getDatabaseHandle())
    await ensureMetric(db, { type: 'post', ownerId: 1 })

    bumpPageView({ type: 'post', ownerId: 1 })
    bumpPageView({ type: 'post', ownerId: 1 })
    expect(pendingViewDelta({ type: 'post', ownerId: 1 })).toBe(2)
    expect(pendingViewDelta({ type: 'post', ownerId: 2 })).toBe(0)

    await flushPageViews()
    expect(pendingViewDelta({ type: 'post', ownerId: 1 })).toBe(0)
    expect(await pvOf('post', 1)).toBe(2)
  })
})
