import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/rate-limit', () => ({
  tryResourceRateLimit: vi.fn(),
}))

vi.mock('@/server/render/feed/generator', () => ({
  feedResponse: vi.fn(),
}))

vi.mock('@/server/render/feed/scope', () => ({
  getSlug: vi.fn(({ slug }: { slug: string }) => ({ kind: 'tag', slug }) as never),
  scopeFromUrl: vi.fn((_url: string, scope?: unknown) => scope ?? { kind: 'site' }),
}))

import { feedRouter } from '@/server/http/resources/feed'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { feedResponse } from '@/server/render/feed/generator'

describe('feed resource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(tryResourceRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ exceeded: false, count: 1 })
    ;(feedResponse as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('<feed />', { headers: { 'Content-Type': 'application/rss+xml' } }),
    )
  })

  it('returns rss feed', async () => {
    const res = await feedRouter.request('http://localhost/feed', undefined, {
      db: {},
      clientAddress: '127.0.0.1',
    } as never)
    expect(res.status).toBe(200)
  })

  it('returns atom feed', async () => {
    const res = await feedRouter.request('http://localhost/feed/atom', undefined, {
      db: {},
      clientAddress: '127.0.0.1',
    } as never)
    expect(res.status).toBe(200)
  })

  it('returns category rss feed', async () => {
    const res = await feedRouter.request('http://localhost/cats/code/feed', undefined, {
      db: {},
      clientAddress: '127.0.0.1',
    } as never)
    expect(res.status).toBe(200)
  })

  it('returns tag atom feed', async () => {
    const res = await feedRouter.request('http://localhost/tags/ai/feed/atom', undefined, {
      db: {},
      clientAddress: '127.0.0.1',
    } as never)
    expect(res.status).toBe(200)
  })

  it('rate-limits feed requests', async () => {
    ;(tryResourceRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ exceeded: true, count: 100 })
    const res = await feedRouter.request('http://localhost/feed', undefined, {
      db: {},
      clientAddress: '127.0.0.1',
    } as never)
    expect(res.status).toBe(429)
  })
})
