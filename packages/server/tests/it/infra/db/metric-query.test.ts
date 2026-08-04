import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { ensureMetric, incrementMetricPvBatch } from '@kobato/server/infra/db/operations/metric'
import { metric } from '@kobato/server/infra/db/schema/metric'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('db/query/metric', () => {
  it('increments pv for valid batched deltas', async () => {
    await db.insert(metric).values([
      { type: 'post', ownerId: 1, pv: 0 },
      { type: 'page', ownerId: 2, pv: 0 },
    ])

    await incrementMetricPvBatch(
      db,
      new Map([
        ['post:1', 1],
        ['page:2', 2],
      ]),
    )

    const postRow = await db
      .select({ pv: metric.pv })
      .from(metric)
      .where(and(eq(metric.type, 'post'), eq(metric.ownerId, 1)))
      .limit(1)
    const pageRow = await db
      .select({ pv: metric.pv })
      .from(metric)
      .where(and(eq(metric.type, 'page'), eq(metric.ownerId, 2)))
      .limit(1)

    expect(postRow[0]?.pv).toBe(1)
    expect(pageRow[0]?.pv).toBe(2)
  })

  it('skips empty and non-positive batched view deltas', async () => {
    await db.insert(metric).values([{ type: 'post', ownerId: 1, pv: 5 }])

    await incrementMetricPvBatch(
      db,
      new Map([
        ['post:1', 0],
        ['page:2', -1],
      ]),
    )

    const rows = await db
      .select({ pv: metric.pv })
      .from(metric)
      .where(and(eq(metric.type, 'post'), eq(metric.ownerId, 1)))
      .limit(1)
    expect(rows[0]?.pv).toBe(5)
  })

  it('skips malformed composite keys (no colon, unknown type, empty id)', async () => {
    await db.insert(metric).values([{ type: 'post', ownerId: 1, pv: 10 }])

    await incrementMetricPvBatch(
      db,
      new Map([
        ['notarget', 5],
        ['note:42', 5],
        ['post:', 5],
      ]),
    )

    const rows = await db
      .select({ pv: metric.pv })
      .from(metric)
      .where(and(eq(metric.type, 'post'), eq(metric.ownerId, 1)))
      .limit(1)
    expect(rows[0]?.pv).toBe(10)
  })
})

describe('db/query/metric — ensureMetric', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the existing row without issuing any write when the row exists', async () => {
    // P1-14: the detail render path calls ensureMetric on every page view,
    // and the row virtually always exists already — the common path must be
    // a pure read (no INSERT/UPSERT → no SQLite write lock on a read path).
    const seeded = await db.insert(metric).values({ type: 'post', ownerId: 1, pv: 7 }).returning()
    const insertSpy = vi.spyOn(db, 'insert')

    const row = await ensureMetric(db, { type: 'post', ownerId: 1 })

    expect(insertSpy).not.toHaveBeenCalled()
    expect(row).toEqual(seeded[0])
  })

  it('inserts defaults and returns the minted row when the row is missing', async () => {
    const insertSpy = vi.spyOn(db, 'insert')

    const row = await ensureMetric(db, { type: 'page', ownerId: 9 })

    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(row.type).toBe('page')
    expect(row.ownerId).toBe(9)
    expect(row.publicId).toMatch(/^[0-9a-f-]{36}$/)
    expect(row.voteUp).toBe(0)
    expect(row.voteDown).toBe(0)
    expect(row.pv).toBe(0)
  })
})
