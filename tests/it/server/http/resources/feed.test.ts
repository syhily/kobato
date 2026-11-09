import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'
import type { AppLocale } from '@/shared/i18n/locales'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { countEntryFiles } from '@/server/infra/cache/file-store'
import { get } from '@/server/infra/cache/registry'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'
import { APP_VERSION } from '@/shared/config/version'

vi.mock('@/server/render/feed/generator', () => ({
  generateFeeds: vi.fn(),
}))

import { onErrorHandler } from '@/server/http/errors'
import { feedRouter } from '@/server/http/resources/feed'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'
import { generateFeeds } from '@/server/render/feed/generator'

// The real file-cache registry: cold misses persist (fire-and-forget), warm
// hits serve without regenerating. Seams: the feed generator; the rate limiter
// runs real against the settings snapshot.
const db = getTestDb()

const BUILT = { rss: '<rss version="2.0">built</rss>', atom: '<feed>built</feed>' }
const REBUILT = { rss: '<rss version="2.0">rebuilt</rss>', atom: '<feed>rebuilt</feed>' }

function requestFeed(url: string, headers?: Record<string, string>) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', makeRequestContext({ request: new Request(url), db }))
    await next()
  })
  app.route('/', feedRouter)
  app.onError(onErrorHandler)
  // Sentinel SSR-style route that must never count against the feed bucket.
  app.get('/sitemap.xml', (c) => c.text('sitemap'))
  return app.request(url, { headers })
}

function feedParams(scope: string, locale: AppLocale = 'zh-CN') {
  return {
    scope,
    locale,
    version: APP_VERSION,
    settingsRevision: representationRevisionsFor(getBlogSettingsBundleSync()).feed,
  }
}

/** The through() write is fire-and-forget; wait for the observable entry. */
async function waitForCachedFeed(scope: string, locale: AppLocale = 'zh-CN'): Promise<void> {
  await vi.waitFor(async () => {
    expect(await get('feed', feedParams(scope, locale))).toEqual(BUILT)
  })
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
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('Content-Language')).toBe('zh-CN')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
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
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    expect((await requestFeed('http://localhost/feed')).status).toBe(200)

    const res = await requestFeed('http://localhost/feed')
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'TOO_MANY_REQUESTS', message: '请求过于频繁，请稍后再试。' },
    })
  })

  it('never counts public non-feed requests against the feed bucket', async () => {
    // Only the feed routes may draw from the feed bucket — never SSR pages.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    // Several hits past the bucket ceiling — none may count against it.
    for (let i = 0; i < 3; i++) {
      expect((await requestFeed('http://localhost/sitemap.xml')).status).toBe(200)
    }
    // The feed endpoints themselves stay guarded by the same bucket.
    expect((await requestFeed('http://localhost/feed')).status).toBe(200)
    expect((await requestFeed('http://localhost/feed')).status).toBe(429)
  })

  it('serves a cache hit without regenerating the feed', async () => {
    const first = await requestFeed('http://localhost/feed')
    expect(first.status).toBe(200)
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await waitForCachedFeed('all')

    // The corpus "changed" — a warm cache must still serve the stored entry.
    ;(generateFeeds as ReturnType<typeof vi.fn>).mockResolvedValue(REBUILT)

    const res = await requestFeed('http://localhost/feed')

    expect(res.status).toBe(200)
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('Content-Language')).toBe('zh-CN')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    await expect(res.text()).resolves.toBe(BUILT.rss)
  })

  it('writes the cache entry after a miss (fire-and-forget)', async () => {
    const res = await requestFeed('http://localhost/feed')

    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await expect(res.text()).resolves.toBe(BUILT.rss)

    await waitForCachedFeed('all')
    expect(await countEntryFiles('feed')).toBe(1)
  })

  it('namespaces the cache entry for category feeds', async () => {
    await requestFeed('http://localhost/cats/tech/feed')
    await waitForCachedFeed('cat:tech')
    expect(await get('feed', feedParams('all'))).toBeNull()
  })

  it('namespaces the cache entry for tag feeds', async () => {
    await requestFeed('http://localhost/tags/tech/feed')
    await waitForCachedFeed('tag:tech')
    expect(await get('feed', feedParams('all'))).toBeNull()
  })

  it('uses the bare `all` scope for the site-wide feed', async () => {
    await requestFeed('http://localhost/feed')
    await waitForCachedFeed('all')
    expect(await countEntryFiles('feed')).toBe(1)
  })

  it('namespaces a category slugged `all` away from the site-wide feed', async () => {
    await requestFeed('http://localhost/cats/all/feed')
    await waitForCachedFeed('cat:all')
    expect(await get('feed', feedParams('all'))).toBeNull()
  })
})

describe('feed resource — conditional requests and locale variants', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    vi.clearAllMocks()
    __resetRateLimitsForTests()
    ;(generateFeeds as ReturnType<typeof vi.fn>).mockResolvedValue(BUILT)
  })

  it('answers 304 on a matching If-None-Match without regenerating the feed', async () => {
    const first = await requestFeed('http://localhost/feed')
    const etag = first.headers.get('ETag')!
    await first.text()
    await waitForCachedFeed('all')

    const cached = await requestFeed('http://localhost/feed', { 'if-none-match': etag })

    expect(cached.status).toBe(304)
    expect(cached.headers.get('ETag')).toBe(etag)
    expect(cached.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(cached.headers.get('Content-Language')).toBe('zh-CN')
    expect(await cached.text()).toBe('')
    expect(generateFeeds).toHaveBeenCalledTimes(1)
  })

  it('keeps the ETag stable across a cache hit (the cached bytes are hashed, not the inputs)', async () => {
    const first = await requestFeed('http://localhost/feed')
    const firstTag = first.headers.get('ETag')
    await first.text()
    await waitForCachedFeed('all')

    // A fresh date inside `generateFeeds` would change a body-derived tag only
    // when the served body changes; a cache hit serves the same bytes.
    ;(generateFeeds as ReturnType<typeof vi.fn>).mockResolvedValue(REBUILT)
    const second = await requestFeed('http://localhost/feed')

    expect(second.status).toBe(200)
    expect(second.headers.get('ETag')).toBe(firstTag)
    expect(generateFeeds).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale If-None-Match and returns 200', async () => {
    const res = await requestFeed('http://localhost/feed', { 'if-none-match': '"stale"' })
    expect(res.status).toBe(200)
    await res.text()
  })

  it('keys and heads the en-US variant separately from zh-CN', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'en-US' },
    })
    try {
      const en = await requestFeed('http://localhost/feed')
      expect(en.headers.get('Content-Language')).toBe('en-US')
      await en.text()

      await waitForCachedFeed('all', 'en-US')
      expect(await get('feed', feedParams('all', 'zh-CN'))).toBeNull()
    } finally {
      setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    }
  })

  it('keys by the pinned settings revision and renders from the same captured bundle', async () => {
    await requestFeed('http://localhost/feed')

    const [, options] = (generateFeeds as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, { settings: unknown }]
    expect(options.settings).toBe(getBlogSettingsBundleSync())

    await waitForCachedFeed('all')
    expect(await countEntryFiles('feed')).toBe(1)
  })

  it('keeps the warm entry across an UNRELATED (security) settings save', async () => {
    const first = await requestFeed('http://localhost/feed')
    await first.text()
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await waitForCachedFeed('all')

    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      security: {
        ...TEST_BLOG_SETTINGS_BUNDLE.security!,
        csrf: { enabled: false, exemptPaths: [] },
      },
    })

    const second = await requestFeed('http://localhost/feed')
    expect(second.status).toBe(200)
    await expect(second.text()).resolves.toBe(BUILT.rss)
    // The feed scope does not list security → same key, cache hit.
    expect(generateFeeds).toHaveBeenCalledTimes(1)
  })

  it('serves a new generation after a settings save instead of the previous feed', async () => {
    const first = await requestFeed('http://localhost/feed')
    expect(first.status).toBe(200)
    await first.text()
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await waitForCachedFeed('all')

    // Any section save advances the revision; the old key is unreachable.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Renamed Blog' },
    })
    ;(generateFeeds as ReturnType<typeof vi.fn>).mockResolvedValue(REBUILT)

    const second = await requestFeed('http://localhost/feed')
    expect(generateFeeds).toHaveBeenCalledTimes(2)
    await expect(second.text()).resolves.toBe(REBUILT.rss)

    const [, options] = (generateFeeds as ReturnType<typeof vi.fn>).mock.calls[1] as [
      unknown,
      { settings: { siteIdentity?: { title?: string } } | null },
    ]
    expect(options.settings?.siteIdentity?.title).toBe('Renamed Blog')

    // Both generations are on disk; only the new one is addressable.
    await vi.waitFor(async () => {
      expect(await get('feed', feedParams('all'))).toEqual(REBUILT)
    })
    expect(await countEntryFiles('feed')).toBe(2)
  })
})
