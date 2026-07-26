import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

vi.mock('@/server/infra/rate-limit', () => ({
  readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
  tryKeyedRateLimit: vi.fn(),
}))

vi.mock('@/server/render/feed/generator', () => ({
  generateFeeds: vi.fn(),
}))

vi.mock('@/server/infra/cache/registry', () => ({
  through: vi.fn(),
}))

import { feedRouter } from '@/server/http/resources/feed'
import { through } from '@/server/infra/cache/registry'
import { tryKeyedRateLimit } from '@/server/infra/rate-limit'
import { generateFeeds } from '@/server/render/feed/generator'

const BUILT = { rss: '<rss version="2.0">built</rss>', atom: '<feed>built</feed>' }
const CACHED = { rss: '<rss version="2.0">cached</rss>', atom: '<feed>cached</feed>' }

const throughMock = through as unknown as ReturnType<typeof vi.fn>

function requestFeed(url: string) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { db: {}, clientAddress: '127.0.0.1' } as never)
    await next()
  })
  app.route('/', feedRouter)
  return app.request(url)
}

describe('feed resource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(tryKeyedRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ exceeded: false, count: 1 })
    ;(generateFeeds as ReturnType<typeof vi.fn>).mockResolvedValue(BUILT)
    // Default: a cache miss — run the loader and return its value.
    throughMock.mockImplementation((_db: unknown, _id: unknown, _params: unknown, loader: () => unknown) => loader())
  })

  it('returns rss feed', async () => {
    const res = await requestFeed('http://localhost/feed')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=1800')
    await expect(res.text()).resolves.toBe(BUILT.rss)
  })

  it('returns atom feed', async () => {
    const res = await requestFeed('http://localhost/feed/atom')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8')
    await expect(res.text()).resolves.toBe(BUILT.atom)
  })

  it('returns category rss feed', async () => {
    const res = await requestFeed('http://localhost/cats/code/feed')
    expect(res.status).toBe(200)
  })

  it('returns tag atom feed', async () => {
    const res = await requestFeed('http://localhost/tags/ai/feed/atom')
    expect(res.status).toBe(200)
  })

  it('rate-limits feed requests', async () => {
    ;(tryKeyedRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ exceeded: true, count: 100 })
    const res = await requestFeed('http://localhost/feed')
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toEqual({ error: 'Too many requests' })
  })

  it('serves a cache hit without regenerating the feed', async () => {
    throughMock.mockResolvedValue(CACHED)

    const res = await requestFeed('http://localhost/feed')

    expect(res.status).toBe(200)
    expect(generateFeeds).not.toHaveBeenCalled()
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=1800')
    await expect(res.text()).resolves.toBe(CACHED.rss)
  })

  it('populates the cache on a miss before responding', async () => {
    const res = await requestFeed('http://localhost/feed')

    expect(generateFeeds).toHaveBeenCalledTimes(1)
    expect(throughMock).toHaveBeenCalledWith({}, 'feed', { scope: 'all' }, expect.any(Function))
    await expect(res.text()).resolves.toBe(BUILT.rss)
  })

  it('namespaces the cache key for category feeds', async () => {
    await requestFeed('http://localhost/cats/tech/feed')
    expect(throughMock).toHaveBeenCalledWith({}, 'feed', { scope: 'cat:tech' }, expect.any(Function))
  })

  it('namespaces the cache key for tag feeds', async () => {
    await requestFeed('http://localhost/tags/tech/feed')
    expect(throughMock).toHaveBeenCalledWith({}, 'feed', { scope: 'tag:tech' }, expect.any(Function))
  })

  it('uses the bare `all` key for the site-wide feed', async () => {
    await requestFeed('http://localhost/feed')
    expect(throughMock).toHaveBeenCalledWith({}, 'feed', { scope: 'all' }, expect.any(Function))
  })

  it('namespaces a category slugged `all` away from the site-wide feed', async () => {
    await requestFeed('http://localhost/cats/all/feed')
    expect(throughMock).toHaveBeenCalledWith({}, 'feed', { scope: 'cat:all' }, expect.any(Function))
    expect(throughMock).not.toHaveBeenCalledWith({}, 'feed', { scope: 'all' }, expect.any(Function))
  })
})
