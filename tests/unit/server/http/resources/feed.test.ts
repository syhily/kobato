import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/infra/rate-limit', () => ({
  readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
  tryKeyedRateLimit: vi.fn(),
}))

vi.mock('@/server/render/feed/generator', () => ({
  generateFeeds: vi.fn(),
}))

vi.mock('@/server/infra/cache/feed-cache', () => ({
  feedCacheFor: vi.fn(),
}))

import { feedRouter } from '@/server/http/resources/feed'
import { feedCacheFor } from '@/server/infra/cache/feed-cache'
import { tryKeyedRateLimit } from '@/server/infra/rate-limit'
import { generateFeeds } from '@/server/render/feed/generator'

const BUILT = { rss: '<rss version="2.0">built</rss>', atom: '<feed>built</feed>' }
const CACHED = { rss: '<rss version="2.0">cached</rss>', atom: '<feed>cached</feed>' }

let cacheGet: ReturnType<typeof vi.fn>
let cacheSet: ReturnType<typeof vi.fn>

function requestFeed(url: string) {
  return feedRouter.request(url, undefined, {
    db: {},
    clientAddress: '127.0.0.1',
  } as never)
}

describe('feed resource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheGet = vi.fn().mockResolvedValue(null)
    cacheSet = vi.fn().mockResolvedValue(undefined)
    ;(tryKeyedRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ exceeded: false, count: 1 })
    ;(generateFeeds as ReturnType<typeof vi.fn>).mockResolvedValue(BUILT)
    ;(feedCacheFor as ReturnType<typeof vi.fn>).mockReturnValue({ get: cacheGet, set: cacheSet, clear: vi.fn() })
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
    cacheGet.mockResolvedValue(CACHED)

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
    expect(cacheSet).toHaveBeenCalledWith(BUILT)
    await expect(res.text()).resolves.toBe(BUILT.rss)
  })

  it('namespaces the cache key for category feeds', async () => {
    await requestFeed('http://localhost/cats/tech/feed')
    expect(feedCacheFor).toHaveBeenCalledWith('cat:tech')
  })

  it('namespaces the cache key for tag feeds', async () => {
    await requestFeed('http://localhost/tags/tech/feed')
    expect(feedCacheFor).toHaveBeenCalledWith('tag:tech')
  })

  it('uses the bare `all` key for the site-wide feed', async () => {
    await requestFeed('http://localhost/feed')
    expect(feedCacheFor).toHaveBeenCalledWith('all')
  })

  it('namespaces a category slugged `all` away from the site-wide feed', async () => {
    await requestFeed('http://localhost/cats/all/feed')
    expect(feedCacheFor).toHaveBeenCalledWith('cat:all')
    expect(feedCacheFor).not.toHaveBeenCalledWith('all')
  })
})
