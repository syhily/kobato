import { call } from '@orpc/server'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { clearAccessLog, closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { __adoptAnalyticsHandleForTests, __resetAnalyticsEngineForTests } from '@/server/bootstrap/analytics-lifecycle'

// analyticsRouter against the real engine: a per-run DuckDB sidecar is
// ADOPTED into the analytics lifecycle (no module mock) and every
// procedure — counters / views / heatmap / metrics — runs the real
// query-parser + aggregation SQL against seeded access_log rows.
// Assertions are on the real aggregates (row counts, distinct visitor
// hashes, weekday/hour extraction, browser names).

const db = getTestDb()

const analyticsHandle: AnalyticsHandle = await createTestAnalyticsDb()
__adoptAnalyticsHandleForTests(analyticsHandle)

const { analyticsRouter } = await import('@/server/http/controllers/analytics.controller')

// Explicit epoch-seconds range so `parseAnalyticsInput` never consults
// the clock; seeded events land inside [1000, 2000).
const rangeInput = { startAt: '1000', endAt: '2000' }

beforeEach(async () => {
  await clearAccessLog(analyticsHandle)
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

/** Three views from two visitors, one referer — the shared seed shape. */
async function seedViews() {
  await seedAccessEvents(analyticsHandle, [
    {
      ts: new Date(1_200_000),
      visitorHash: 'a',
      path: '/post/hello',
      entityType: 'post',
      entityId: 1,
      refererHost: 'google.com',
      browser: 'Chrome',
    },
    {
      ts: new Date(1_300_000),
      visitorHash: 'a',
      path: '/post/hello',
      entityType: 'post',
      entityId: 1,
      browser: 'Chrome',
    },
    {
      ts: new Date(1_400_000),
      visitorHash: 'b',
      path: '/post/hello',
      entityType: 'post',
      entityId: 1,
      browser: 'Firefox',
    },
  ])
}

describe('analyticsRouter.counters', () => {
  it('aggregates real counters from the seeded access log', async () => {
    await seedViews()
    const ctx = makeAuthedCtx({ db })
    const res = (await call(analyticsRouter.counters, rangeInput, { context: ctx })) as {
      visits: number
      visitors: number
      referers: number
    }
    // visits = row count, visitors = distinct visitor_hash,
    // referers = distinct non-empty referer_host.
    expect(res).toEqual({ visits: 3, visitors: 2, referers: 1 })
  })
})

describe('analyticsRouter.views', () => {
  it('returns one real time bucket per seeded minute', async () => {
    await seedViews()
    const ctx = makeAuthedCtx({ db })
    const res = (await call(analyticsRouter.views, rangeInput, { context: ctx })) as {
      time: string
      visits: number
      visitors: number
    }[]
    // The three events sit in three distinct 1-minute buckets.
    expect(res).toHaveLength(3)
    expect(res.reduce((sum, point) => sum + point.visits, 0)).toBe(3)
    expect(res.every((point) => point.visitors === 1)).toBe(true)
  })
})

describe('analyticsRouter.heatmap', () => {
  it('extracts weekday/hour from the real timestamps', async () => {
    await seedViews()
    const ctx = makeAuthedCtx({ db })
    const res = (await call(analyticsRouter.heatmap, rangeInput, { context: ctx })) as {
      weekday: number
      hour: number
      visits: number
      visitors: number
    }[]
    // All three events are 1970-01-01 00:2x UTC — a Thursday (dow 4).
    expect(res).toEqual([{ weekday: 4, hour: 0, visits: 3, visitors: 2 }])
  })
})

describe('analyticsRouter.metrics', () => {
  it('groups real rows by browser name, ordered by visits', async () => {
    await seedViews()
    const ctx = makeAuthedCtx({ db })
    const res = (await call(analyticsRouter.metrics, { ...rangeInput, type: 'browser' }, { context: ctx })) as {
      name: string
      visits: number
      visitors: number
    }[]
    expect(res).toEqual([
      { name: 'Chrome', visits: 2, visitors: 1 },
      { name: 'Firefox', visits: 1, visitors: 1 },
    ])
  })

  it('throws BAD_REQUEST for an unknown metric type', async () => {
    const ctx = makeAuthedCtx({ db })
    await expect(
      // @ts-expect-error Intentionally passing an invalid metric type to test error handling
      call(analyticsRouter.metrics, { preset: 'today', type: 'unknownType' }, { context: ctx }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
