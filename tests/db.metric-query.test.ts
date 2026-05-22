import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vite-plus/test'

import { incrementMetricPvBatch } from '@/server/infra/db/operations/metric'
import { db } from '@/server/infra/db/pool'
import { metric } from '@/server/infra/db/schema'

beforeEach(async () => {
  await db.delete(metric)
})

describe('db/query/metric', () => {
  it('increments pv for valid batched deltas', async () => {
    await db.insert(metric).values([
      { type: 'post', ownerId: 1n, pv: 0 },
      { type: 'page', ownerId: 2n, pv: 0 },
    ])

    await incrementMetricPvBatch(
      new Map([
        ['post:1', 1],
        ['page:2', 2],
      ]),
    )

    const postRow = await db
      .select({ pv: metric.pv })
      .from(metric)
      .where(and(eq(metric.type, 'post'), eq(metric.ownerId, 1n)))
      .limit(1)
    const pageRow = await db
      .select({ pv: metric.pv })
      .from(metric)
      .where(and(eq(metric.type, 'page'), eq(metric.ownerId, 2n)))
      .limit(1)

    expect(postRow[0]?.pv).toBe(1)
    expect(pageRow[0]?.pv).toBe(2)
  })

  it('skips empty and non-positive batched view deltas', async () => {
    await db.insert(metric).values([{ type: 'post', ownerId: 1n, pv: 5 }])

    await incrementMetricPvBatch(
      new Map([
        ['post:1', 0],
        ['page:2', -1],
      ]),
    )

    const rows = await db
      .select({ pv: metric.pv })
      .from(metric)
      .where(and(eq(metric.type, 'post'), eq(metric.ownerId, 1n)))
      .limit(1)
    expect(rows[0]?.pv).toBe(5)
  })

  it('skips malformed composite keys (no colon, unknown type, empty id)', async () => {
    await db.insert(metric).values([{ type: 'post', ownerId: 1n, pv: 10 }])

    await incrementMetricPvBatch(
      new Map([
        ['notarget', 5],
        ['note:42', 5],
        ['post:', 5],
      ]),
    )

    const rows = await db
      .select({ pv: metric.pv })
      .from(metric)
      .where(and(eq(metric.type, 'post'), eq(metric.ownerId, 1n)))
      .limit(1)
    expect(rows[0]?.pv).toBe(10)
  })
})
