import { beforeEach, describe, expect, it, vi } from 'vitest'

const incrementMetricPvBatch = vi.fn()

vi.mock('@/server/infra/db/operations/metric', () => ({
  incrementMetricPvBatch,
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: vi.fn(),
}))

async function resetBatcher() {
  const mod = await import('@/server/domains/analytics/pv-batcher')
  mod.resetPageViewBatcher()
  return mod
}

describe('analytics/pv-batcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds snapshot back to new buffer on flush failure (not double-count)', async () => {
    incrementMetricPvBatch.mockRejectedValueOnce(new Error('DB down'))

    const { bumpPageView, flushPageViews } = await resetBatcher()
    const db = {} as any

    // 3 increments before flush
    bumpPageView({ type: 'post', ownerId: 1n }, db)
    bumpPageView({ type: 'post', ownerId: 1n }, db)
    bumpPageView({ type: 'post', ownerId: 2n }, db)

    // Start flush; during the async window, 2 more increments land
    const flushPromise = flushPageViews(db)

    // These go into the NEW buffer while snapshot is in-flight
    bumpPageView({ type: 'post', ownerId: 1n }, db)
    bumpPageView({ type: 'post', ownerId: 2n }, db)

    await flushPromise

    // Snapshot: post:1=2, post:2=1
    // New buffer during flush: post:1=1, post:2=1
    // Recovery adds them: post:1=3, post:2=2
    // Total = 5, which is exactly the number of increments we performed.
    const { flushPageViews: flushAgain } = await import('@/server/domains/analytics/pv-batcher')
    await flushAgain(db)

    expect(incrementMetricPvBatch).toHaveBeenCalledTimes(2)
    const recoveredMap = incrementMetricPvBatch.mock.calls[1][1] as Map<string, number>
    expect(recoveredMap.get('post:1')).toBe(3)
    expect(recoveredMap.get('post:2')).toBe(2)
  })

  it('clears buffer after successful flush', async () => {
    incrementMetricPvBatch.mockResolvedValueOnce(undefined)

    const { bumpPageView, flushPageViews } = await resetBatcher()
    const db = {} as any

    bumpPageView({ type: 'post', ownerId: 1n }, db)
    await flushPageViews(db)

    // Second flush should be a no-op because buffer is empty
    await flushPageViews(db)
    expect(incrementMetricPvBatch).toHaveBeenCalledTimes(1)
  })
})
