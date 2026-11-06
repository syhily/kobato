import { describe, expect, it } from 'vitest'

import { rateLimitBounds } from '@/shared/config/defaults'
import { rateLimitBucketSchema } from '@/shared/config/rate-limit-bucket'

// The server section schema and the admin ThresholdForm both compose this
// bucket schema — its messages are what the save-failure toast surfaces, so
// pin them as user-facing Chinese that names the bound.
describe('shared/config/rate-limit-bucket', () => {
  it('accepts the boundary values', () => {
    for (const [windowSeconds, maxAttempts] of [
      [rateLimitBounds.windowSeconds.min, rateLimitBounds.maxAttempts.min],
      [rateLimitBounds.windowSeconds.max, rateLimitBounds.maxAttempts.max],
    ]) {
      expect(rateLimitBucketSchema.safeParse({ windowSeconds, maxAttempts }).success).toBe(true)
    }
  })

  it('rejects an over-bound maxAttempts with the named bound', () => {
    const result = rateLimitBucketSchema.safeParse({ windowSeconds: 300, maxAttempts: 1001 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('最大尝试次数不能超过 1000')
  })

  it('rejects an under-bound windowSeconds with the named bound', () => {
    const result = rateLimitBucketSchema.safeParse({ windowSeconds: 59, maxAttempts: 5 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('时间窗口不能小于 60 秒')
  })

  it('rejects non-integer values', () => {
    const result = rateLimitBucketSchema.safeParse({ windowSeconds: 300.5, maxAttempts: 5 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('时间窗口必须是整数秒')
  })
})
