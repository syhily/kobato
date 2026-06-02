import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/analytics/query', () => ({
  parseAnalyticsSearch: vi.fn(),
  queryCounters: vi.fn(),
  queryViews: vi.fn(),
  queryHeatmap: vi.fn(),
  queryMetric: vi.fn(),
}))

const queryMod = await import('@/server/domains/analytics/query')
const { analyticsRouter } = await import('@/server/http/controllers/analytics.controller')

function mockAnalyticsInput() {
  return { range: { startAt: 0, endAt: 1000 }, filters: {} }
}

describe('analyticsRouter.counters', () => {
  it('returns counters from the service', async () => {
    vi.mocked(queryMod.parseAnalyticsSearch).mockReturnValueOnce(mockAnalyticsInput())
    vi.mocked(queryMod.queryCounters).mockResolvedValueOnce({
      visits: 10,
      visitors: 5,
      referers: 3,
    })
    const ctx = makeAuthedCtx()
    const res = (await call(analyticsRouter.counters, { preset: 'today' }, { context: ctx })) as {
      visits: number
    }
    expect(res.visits).toBe(10)
  })
})

describe('analyticsRouter.views', () => {
  it('returns views points from the service', async () => {
    vi.mocked(queryMod.parseAnalyticsSearch).mockReturnValueOnce(mockAnalyticsInput())
    vi.mocked(queryMod.queryViews).mockResolvedValueOnce([{ time: '2026-01-01T00:00:00.000Z', visits: 1, visitors: 1 }])
    const ctx = makeAuthedCtx()
    const res = (await call(analyticsRouter.views, { preset: 'today' }, { context: ctx })) as unknown[]
    expect(res).toHaveLength(1)
  })
})

describe('analyticsRouter.heatmap', () => {
  it('returns heatmap cells from the service', async () => {
    vi.mocked(queryMod.parseAnalyticsSearch).mockReturnValueOnce(mockAnalyticsInput())
    vi.mocked(queryMod.queryHeatmap).mockResolvedValueOnce([{ weekday: 0, hour: 0, visits: 1, visitors: 1 }])
    const ctx = makeAuthedCtx()
    const res = (await call(analyticsRouter.heatmap, { preset: 'today' }, { context: ctx })) as unknown[]
    expect(res).toHaveLength(1)
  })
})

describe('analyticsRouter.metrics', () => {
  it('returns metric rows from the service', async () => {
    vi.mocked(queryMod.parseAnalyticsSearch).mockReturnValueOnce(mockAnalyticsInput())
    vi.mocked(queryMod.queryMetric).mockResolvedValueOnce([{ name: 'Chrome', visits: 5, visitors: 3 }])
    const ctx = makeAuthedCtx()
    const res = (await call(
      analyticsRouter.metrics,
      { preset: 'today', type: 'browser' },
      { context: ctx },
    )) as unknown[]
    expect(res).toHaveLength(1)
  })

  it('throws BAD_REQUEST for an unknown metric type', async () => {
    const ctx = makeAuthedCtx()
    await expect(
      // @ts-expect-error Intentionally passing an invalid metric type to test error handling
      call(analyticsRouter.metrics, { preset: 'today', type: 'unknownType' }, { context: ctx }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
