import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { makePublicCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/images/services/resolve', () => ({
  resolveImageRef: vi.fn(),
}))

const imageMeta = await import('@/server/domains/images/services/resolve')
const { __resetRateLimitsForTests, tryResourceRateLimit } = await import('@/server/infra/rate-limit')
const { imageRouter } = await import('@/server/http/controllers/image.controller')

beforeEach(() => {
  __resetRateLimitsForTests()
})

describe('imageRouter.resolveThumbhash', () => {
  it('throws TOO_MANY_REQUESTS when the rate limit is exceeded', async () => {
    // Shrink the resource bucket so one seeded hit exhausts it; the
    // controller's own hit is the one that exceeds.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resourceIp: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    await tryResourceRateLimit('127.0.0.1')

    const ctx = makePublicCtx()
    await expect(
      call(imageRouter.resolveThumbhash, { src: 'https://cdn.example.com/images/test.jpg' }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })

  it('returns thumbhash, width, and height when image is found', async () => {
    vi.mocked(imageMeta.resolveImageRef).mockResolvedValueOnce({
      width: 100,
      height: 200,
      thumbhash: 'abc123',
      publicUrl: 'https://cdn.example.com/images/test.jpg',
    })
    const ctx = makePublicCtx()
    const res = (await call(
      imageRouter.resolveThumbhash,
      { src: 'https://cdn.example.com/images/test.jpg' },
      { context: ctx },
    )) as {
      thumbhash: string | null
      width: number | null
      height: number | null
    }
    expect(res.thumbhash).toBe('abc123')
    expect(res.width).toBe(100)
    expect(res.height).toBe(200)
  })

  it('returns nulls when image is not found', async () => {
    vi.mocked(imageMeta.resolveImageRef).mockResolvedValueOnce(null)
    const ctx = makePublicCtx()
    const res = (await call(
      imageRouter.resolveThumbhash,
      { src: 'https://cdn.example.com/images/missing.jpg' },
      { context: ctx },
    )) as {
      thumbhash: string | null
      width: number | null
      height: number | null
    }
    expect(res.thumbhash).toBeNull()
    expect(res.width).toBeNull()
    expect(res.height).toBeNull()
  })
})
