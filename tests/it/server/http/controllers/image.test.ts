import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makePublicCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/infra/rate-limit', () => ({
  tryResourceRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
}))

vi.mock('@/server/domains/images/services/cover', () => ({
  loadImageThumbhash: vi.fn(),
}))

const imageMeta = await import('@/server/domains/images/services/cover')
const rateLimitMod = await import('@/server/infra/rate-limit')
const { imageRouter } = await import('@/server/http/controllers/image.controller')

describe('imageRouter.resolveThumbhash', () => {
  it('throws TOO_MANY_REQUESTS when the rate limit is exceeded', async () => {
    vi.mocked(rateLimitMod.tryResourceRateLimit).mockResolvedValueOnce({ count: 100, exceeded: true })
    const ctx = makePublicCtx()
    await expect(
      call(imageRouter.resolveThumbhash, { src: 'https://cdn.example.com/images/test.jpg' }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })

  it('returns thumbhash, width, and height when image is found', async () => {
    vi.mocked(imageMeta.loadImageThumbhash).mockResolvedValueOnce({
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
    vi.mocked(imageMeta.loadImageThumbhash).mockResolvedValueOnce(null)
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
