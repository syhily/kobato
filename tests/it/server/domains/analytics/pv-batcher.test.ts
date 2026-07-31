import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { ensureMetric, findMetricByTarget } from '@/server/infra/db/operations/metric'

// The page-view batcher against the real engine: flushes land in the
// real `metric` table through the real `incrementMetricPvBatch`. A
// flush failure is induced with a real TEMP trigger that aborts every
// metric UPDATE, so the merge-back recovery is verified end-to-end —
// including the transaction rollback that leaves the counters intact.

const db = getTestDb()

async function freshBatcher() {
  const mod = await import('@/server/domains/analytics/services/pv-batcher')
  resetAllBatchers()
  return mod
}

/** Make every metric UPDATE fail until `healMetricUpdates` runs. */
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

    // 3 increments before flush
    bumpPageView({ type: 'post', ownerId: 1 })
    bumpPageView({ type: 'post', ownerId: 1 })
    bumpPageView({ type: 'post', ownerId: 2 })

    // Start flush; during the async window, 2 more increments land
    const flushPromise = flushPageViews()

    // These go into the NEW buffer while the snapshot is in-flight
    bumpPageView({ type: 'post', ownerId: 1 })
    bumpPageView({ type: 'post', ownerId: 2 })

    await flushPromise

    // The failed flush rolled back: nothing was written.
    expect(await pvOf('post', 1)).toBe(0)
    expect(await pvOf('post', 2)).toBe(0)

    // Snapshot: post:1=2, post:2=1
    // New buffer during flush: post:1=1, post:2=1
    // Recovery merges them: post:1=3, post:2=2 — exactly the 5 bumps.
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

    // Second flush is a no-op because the buffer is empty — the count
    // must not move.
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
