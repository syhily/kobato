import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { Env } from '@kobato/server/http/hono-env.ts'

import { content as contentTable } from '@kobato/db/schema/content.ts'
import { post as postTable } from '@kobato/db/schema/post.ts'
import { APP_VERSION } from '@kobato/distribution/app.ts'
import { onErrorHandler } from '@kobato/server/http/errors.ts'
import { feedRouter } from '@kobato/server/http/resources/feed.ts'
import { countEntryFiles } from '@kobato/server/infra/cache/file-store.ts'
import { get } from '@kobato/server/infra/cache/registry.ts'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/server/tests/utils/blog-settings.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Feeds are generated for real from the seeded database; the spy counts
// generations to prove cache hits without regeneration.
const generateFeeds = vi.spyOn(await import('@kobato/server/render/feed/generator.tsx'), 'generateFeeds')

const db = getTestDb()

function requestFeed(url: string, headers?: Record<string, string>) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', makeRequestContext({ request: new Request(url), db }))
    await next()
  })
  app.route('/', feedRouter)
  app.onError(onErrorHandler)
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

async function waitForCachedFeed(scope: string, locale: AppLocale = 'zh-CN'): Promise<void> {
  await vi.waitFor(async () => {
    const cached = await get<'feed', { rss: string; atom: string }>('feed', feedParams(scope, locale))
    expect(cached?.rss).toContain('<rss')
  })
}

async function seedFeedPost(slug: string): Promise<void> {
  const rows = await db
    .insert(postTable)
    .values({
      slug,
      title: slug,
      summary: 'feed summary',
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      visible: true,
    })
    .returning({ id: postTable.id })
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: rows[0]!.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, rows[0]!.id))
}

describe('feed resource', () => {
  beforeEach(async () => {
    generateFeeds.mockClear()
    await clearAllTables(db)
    __resetRateLimitsForTests()
    await seedFeedPost('hello-feed')
  })

  it('returns a real rss feed with the seeded post', async () => {
    const res = await requestFeed('http://localhost/feed')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('Content-Language')).toBe('zh-CN')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    const xml = await res.text()
    expect(xml).toContain('<rss')
    expect(xml).toContain('hello-feed')
  })

  it('returns a real atom feed', async () => {
    const res = await requestFeed('http://localhost/feed/atom')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8')
    const xml = await res.text()
    expect(xml).toContain('<feed')
    expect(xml).toContain('hello-feed')
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
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    for (let i = 0; i < 3; i++) {
      expect((await requestFeed('http://localhost/sitemap.xml')).status).toBe(200)
    }
    expect((await requestFeed('http://localhost/feed')).status).toBe(200)
    expect((await requestFeed('http://localhost/feed')).status).toBe(429)
  })

  it('serves a cache hit without regenerating the feed', async () => {
    const first = await requestFeed('http://localhost/feed')
    expect(first.status).toBe(200)
    const firstBody = await first.text()
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await waitForCachedFeed('all')

    const res = await requestFeed('http://localhost/feed')

    expect(res.status).toBe(200)
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('Content-Language')).toBe('zh-CN')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    await expect(res.text()).resolves.toBe(firstBody)
  })

  it('writes the cache entry after a miss (fire-and-forget)', async () => {
    const res = await requestFeed('http://localhost/feed')

    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await expect(res.text()).resolves.toContain('<rss')

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
    generateFeeds.mockClear()
    await clearAllTables(db)
    __resetRateLimitsForTests()
    await seedFeedPost('hello-feed')
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

    const [, options] = generateFeeds.mock.calls[0] as [unknown, { settings: unknown }]
    expect(options.settings).toBe(getBlogSettingsBundleSync())

    await waitForCachedFeed('all')
    expect(await countEntryFiles('feed')).toBe(1)
  })

  it('keeps the warm entry across an UNRELATED (security) settings save', async () => {
    const first = await requestFeed('http://localhost/feed')
    const firstBody = await first.text()
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
    await expect(second.text()).resolves.toBe(firstBody)
    expect(generateFeeds).toHaveBeenCalledTimes(1)
  })

  it('serves a new generation after a settings save instead of the previous feed', async () => {
    const first = await requestFeed('http://localhost/feed')
    expect(first.status).toBe(200)
    await first.text()
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await waitForCachedFeed('all')

    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Renamed Blog' },
    })

    const second = await requestFeed('http://localhost/feed')
    expect(generateFeeds).toHaveBeenCalledTimes(2)
    await expect(second.text()).resolves.toContain('Renamed Blog')

    const [, options] = generateFeeds.mock.calls[1] as [unknown, { settings: { siteIdentity?: { title?: string } } }]
    expect(options.settings?.siteIdentity?.title).toBe('Renamed Blog')

    await vi.waitFor(async () => {
      const cached = await get<'feed', { rss: string }>('feed', feedParams('all'))
      expect(cached?.rss).toContain('Renamed Blog')
    })
    expect(await countEntryFiles('feed')).toBe(2)
  })
})
