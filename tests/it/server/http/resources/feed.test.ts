import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { kvCache } from '@/server/infra/db/schema/kv-cache'

vi.mock('@/server/render/feed/generator', () => ({
  generateFeeds: vi.fn(),
}))

import { feedRouter } from '@/server/http/resources/feed'
import { resolveCacheSlot } from '@/server/infra/cache/registry'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'
import { generateFeeds } from '@/server/render/feed/generator'

// The REAL cache registry against the shared in-memory kv_cache table:
// a cold cache runs the (mocked) feed generator and persists the entry;
// a warm cache serves the persisted row without regenerating. Only the
// generator stays mocked — a true external to the cache contract under
// test. The rate limiter runs for real against the settings snapshot.
const db = getTestDb()

const BUILT = { rss: '<rss version="2.0">built</rss>', atom: '<feed>built</feed>' }
const REBUILT = { rss: '<rss version="2.0">rebuilt</rss>', atom: '<feed>rebuilt</feed>' }

function requestFeed(url: string) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { db, clientAddress: '127.0.0.1' } as never)
    await next()
  })
  app.route('/', feedRouter)
  return app.request(url)
}

function feedKey(scope: string): string {
  return `${resolveCacheSlot('feed').prefix}${scope}`
}

async function cachedFeedScopes(): Promise<string[]> {
  const rows = await db.select({ key: kvCache.key }).from(kvCache).where(eq(kvCache.bucket, 'feed'))
  const prefix = resolveCacheSlot('feed').prefix
  return rows.map((row) => row.key.slice(prefix.length)).sort()
}

describe('feed resource', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    vi.clearAllMocks()
    __resetRateLimitsForTests()
    ;(generateFeeds as ReturnType<typeof vi.fn>).mockResolvedValue(BUILT)
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
    // Shrink the resource bucket so the second request in the window trips.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resourceIp: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    expect((await requestFeed('http://localhost/feed')).status).toBe(200)

    const res = await requestFeed('http://localhost/feed')
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toEqual({ error: 'Too many requests' })
  })

  it('serves a cache hit without regenerating the feed', async () => {
    const first = await requestFeed('http://localhost/feed')
    expect(first.status).toBe(200)
    expect(generateFeeds).toHaveBeenCalledTimes(1)

    // The corpus "changed" — a warm cache must still serve the stored row.
    ;(generateFeeds as ReturnType<typeof vi.fn>).mockResolvedValue(REBUILT)

    const res = await requestFeed('http://localhost/feed')

    expect(res.status).toBe(200)
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=1800')
    await expect(res.text()).resolves.toBe(BUILT.rss)
  })

  it('populates the cache on a miss before responding', async () => {
    const res = await requestFeed('http://localhost/feed')

    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await expect(res.text()).resolves.toBe(BUILT.rss)

    const rows = await db
      .select()
      .from(kvCache)
      .where(eq(kvCache.key, feedKey('all')))
    expect(rows).toHaveLength(1)
    expect(rows[0].bucket).toBe('feed')
    expect(rows[0].value).toEqual(BUILT)
  })

  it('namespaces the cache key for category feeds', async () => {
    await requestFeed('http://localhost/cats/tech/feed')
    expect(await cachedFeedScopes()).toEqual(['cat:tech'])
  })

  it('namespaces the cache key for tag feeds', async () => {
    await requestFeed('http://localhost/tags/tech/feed')
    expect(await cachedFeedScopes()).toEqual(['tag:tech'])
  })

  it('uses the bare `all` key for the site-wide feed', async () => {
    await requestFeed('http://localhost/feed')
    expect(await cachedFeedScopes()).toEqual(['all'])
  })

  it('namespaces a category slugged `all` away from the site-wide feed', async () => {
    await requestFeed('http://localhost/cats/all/feed')
    expect(await cachedFeedScopes()).toEqual(['cat:all'])
  })
})
