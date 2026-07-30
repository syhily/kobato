import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { incrementMetricPvBatch } from '@/server/infra/db/operations/metric'
import { metric } from '@/server/infra/db/schema/metric'

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
