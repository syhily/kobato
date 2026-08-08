import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { ensureMetric, findMetricByTarget } from '@/server/infra/db/operations/metric'

// The page-view batcher against the real engine; flush failures are induced
// with a real TEMP trigger, so merge-back recovery is verified end-to-end.

const db = getTestDb()

async function freshBatcher() {
  const mod = await import('@/server/domains/analytics/services/pv-batcher')
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

    // These go into the NEW buffer while the snapshot is in-flight
    bumpPageView({ type: 'post', ownerId: 1 })
    bumpPageView({ type: 'post', ownerId: 2 })

    await flushPromise

    // The failed flush rolled back: nothing was written.
    expect(await pvOf('post', 1)).toBe(0)
    expect(await pvOf('post', 2)).toBe(0)

    // Recovery merges snapshot (2/1) with the new buffer (1/1): 3/2.
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

    // Second flush is a no-op: the empty buffer must not move the count.
    await flushPageViews()
    expect(await pvOf('post', 1)).toBe(1)
  })

  it('reports the unflushed delta via pendingViewDelta, and zero after the flush lands', async () => {
    const { bumpPageView, flushPageViews, pendingViewDelta } = await freshBatcher()

    // Pre-init the guard degenerates to 0 — readers never throw.
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
