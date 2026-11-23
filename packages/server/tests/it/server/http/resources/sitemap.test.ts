import type { Env } from '@kobato/server/http/hono-env'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import { onErrorHandler } from '@kobato/server/http/errors'
import { countEntryFiles, wipeCache } from '@kobato/server/infra/cache/file-store'
import { __resetMemoryCacheForTests } from '@kobato/server/infra/cache/memory-store'
import { resetCacheCounterMemo } from '@kobato/server/infra/cache/registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const throughSpy = vi.spyOn(await import('@kobato/server/infra/cache/registry'), 'through')
void throughSpy

const db = getTestDb()
const REVISIONS = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)

function createTestApp() {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', {
      clientAddress: '127.0.0.1',
      db,
      settings: TEST_BLOG_SETTINGS_BUNDLE,
      localization: {
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: null,
        revision: 'boot-test:0000000001',
        revisions: REVISIONS,
      },
    } as never)
    await next()
  })
  app.onError(onErrorHandler)
  return app
}

async function makeApp() {
  const { sitemapRouter } = await import('@kobato/server/http/resources/sitemap')
  const app = createTestApp()
  app.route('/', sitemapRouter)
  return app
}

async function seedPublishedPost(slug: string): Promise<void> {
  const [meta] = await sqliteOf(db)
    .insert(postTable)
    .values({ slug, title: slug, summary: '', published: true, publishedAt: new Date('2020-01-01'), visible: true })
    .returning({ id: postTable.id })
  const [revision] = await sqliteOf(db)
    .insert(contentTable)
    .values({ type: 'post', ownerId: meta!.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await sqliteOf(db).update(postTable).set({ publishedRevisionId: revision!.id }).where(eq(postTable.id, meta!.id))
}

beforeEach(async () => {
  throughSpy.mockClear()
  __resetRateLimitsForTests()
  await clearAllTables(db)
  await wipeCache()
  __resetMemoryCacheForTests()
  resetCacheCounterMemo()
})

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('sitemapRouter', () => {
  it('builds the sitemap from the pinned settings + sitemap revision on cache miss', async () => {
    await seedPublishedPost('hello')
    const app = await makeApp()

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    const xml = await res.text()
    expect(xml).toContain('<urlset')
    expect(xml).toContain('/posts/hello')
    expect(throughSpy).toHaveBeenCalledWith('sitemap', { settingsRevision: REVISIONS.sitemap }, expect.any(Function))
  })

  it('serves the second request from the cache entry without rebuilding', async () => {
    await seedPublishedPost('cached-post')
    const app = await makeApp()

    const first = await app.request('/sitemap.xml')
    const firstXml = await first.text()
    await vi.waitFor(async () => {
      expect(await countEntryFiles('sitemap')).toBe(1)
    })

    const second = await app.request('/sitemap.xml')
    expect(second.status).toBe(200)
    await expect(second.text()).resolves.toBe(firstXml)
    expect(throughSpy).toHaveBeenCalledTimes(2)
  })

  it('answers 304 on a matching If-None-Match without a body', async () => {
    const app = await makeApp()
    const first = await app.request('/sitemap.xml')
    const etag = first.headers.get('ETag')!

    const cachedRes = await app.request('/sitemap.xml', { headers: { 'if-none-match': etag } })

    expect(cachedRes.status).toBe(304)
    expect(cachedRes.headers.get('ETag')).toBe(etag)
    expect(cachedRes.headers.get('Cache-Control')).toBe('public, no-cache')
    await expect(cachedRes.text()).resolves.toBe('')
  })

  it('returns 429 when the real sitemap rate limit is exhausted', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: { ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit, resource: { windowSeconds: 60, maxAttempts: 2 } },
    } as typeof TEST_BLOG_SETTINGS_BUNDLE)
    const app = await makeApp()

    expect((await app.request('/sitemap.xml')).status).toBe(200)
    expect((await app.request('/sitemap.xml')).status).toBe(200)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'TOO_MANY_REQUESTS', message: '请求过于频繁，请稍后再试。' },
    })
  })
})
