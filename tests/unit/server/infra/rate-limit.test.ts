import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
}

const mockRedis = {
  pipeline: vi.fn(() => mockPipeline),
}

vi.mock('@/server/infra/redis/storage', () => ({
  redisInstance: () => mockRedis,
}))

import { tryRateLimit } from '@/server/infra/rate-limit'

describe('rate-limit — fail-closed when Redis is unreachable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns exceeded:true when Redis pipeline throws', async () => {
    mockPipeline.exec.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await tryRateLimit('1.2.3.4')

    expect(result.exceeded).toBe(true)
    expect(result.count).toBe(Number.POSITIVE_INFINITY)
  })

  it('returns exceeded:true when pipeline result contains an error', async () => {
    mockPipeline.exec.mockResolvedValue([[new Error('OOM'), null]])

    const result = await tryRateLimit('1.2.3.4')

    expect(result.exceeded).toBe(true)
    expect(result.count).toBe(Number.POSITIVE_INFINITY)
  })

  it('returns exceeded:true when pipeline result is null', async () => {
    mockPipeline.exec.mockResolvedValue(null)

    const result = await tryRateLimit('1.2.3.4')

    expect(result.exceeded).toBe(true)
    expect(result.count).toBe(Number.POSITIVE_INFINITY)
  })

  it('allows the request when Redis responds normally', async () => {
    mockPipeline.exec.mockResolvedValue([[null, 1]])

    const result = await tryRateLimit('1.2.3.4')

    expect(result.exceeded).toBe(false)
    expect(result.count).toBe(1)
  })
})
