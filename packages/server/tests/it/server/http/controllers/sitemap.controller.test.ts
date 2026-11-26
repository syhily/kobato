import { sqliteOf } from '@kobato/db/sqlite/database'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import { countEntryFiles, wipeCache } from '@kobato/server/infra/cache/file-store'
import { __resetMemoryCacheForTests } from '@kobato/server/infra/cache/memory-store'
import { resetCacheCounterMemo } from '@kobato/server/infra/cache/registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { callRpc, parseRpcJson } from '@kobato/server/tests/utils/rpc-call'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const throughSpy = vi.spyOn(await import('@kobato/server/infra/cache/registry'), 'through')

const db = getTestDb()
const REVISIONS = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)

interface SitemapAnswer {
  kind: 'ok'
  body: string
  etag: string
  contentType: string
  cacheControl: string
  contentLanguage: string | null
}

interface SitemapNotModified {
  kind: 'not-modified'
  etag: string
  contentType: string
  cacheControl: string
  contentLanguage: string | null
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

async function callSitemap(input: Record<string, unknown>): Promise<Response> {
  return callRpc('/public/sitemap/xml', input, makePublicCtx({ db }))
}

beforeEach(async () => {
  throughSpy.mockClear()
  __resetRateLimitsForTests()
  await clearAllTables(db)
  await wipeCache()
  __resetMemoryCacheForTests()
  resetCacheCounterMemo()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('public.sitemap.xml', () => {
  it('builds the sitemap from the pinned settings + sitemap revision on cache miss', async () => {
    await seedPublishedPost('hello')
    const res = await callSitemap({})
    expect(res.status).toBe(200)
    const answer = await parseRpcJson<SitemapAnswer>(res)
    expect(answer.kind).toBe('ok')
    expect(answer.contentType).toBe('application/xml; charset=utf-8')
    expect(answer.cacheControl).toBe('public, no-cache')
    expect(answer.contentLanguage).toBeNull()
    expect(answer.etag).toMatch(/^"[0-9a-f]{32}"$/)
    expect(answer.body).toContain('<urlset')
    expect(answer.body).toContain('/posts/hello')
    expect(throughSpy).toHaveBeenCalledWith('sitemap', { settingsRevision: REVISIONS.sitemap }, expect.any(Function))
  })

  it('serves the second call from the cache entry without rebuilding', async () => {
    await seedPublishedPost('cached-post')
    const first = await parseRpcJson<SitemapAnswer>(await callSitemap({}))
    await vi.waitFor(async () => {
      expect(await countEntryFiles('sitemap')).toBe(1)
    })

    const second = await parseRpcJson<SitemapAnswer>(await callSitemap({}))

    expect(second.body).toBe(first.body)
    expect(second.etag).toBe(first.etag)
    expect(throughSpy).toHaveBeenCalledTimes(2)
  })

  it('answers not-modified on a matching ifNoneMatch', async () => {
    const first = await parseRpcJson<SitemapAnswer>(await callSitemap({}))
    const second = await parseRpcJson<SitemapNotModified>(await callSitemap({ ifNoneMatch: first.etag }))

    expect(second.kind).toBe('not-modified')
    expect(second.etag).toBe(first.etag)
    expect(second.contentType).toBe(first.contentType)
    expect(second.cacheControl).toBe(first.cacheControl)
    expect(second.contentLanguage).toBeNull()
  })

  it('returns 429 when the sitemap bucket is exhausted', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: { ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!, resource: { windowSeconds: 60, maxAttempts: 2 } },
    })
    expect((await callSitemap({})).status).toBe(200)
    expect((await callSitemap({})).status).toBe(200)
    expect((await callSitemap({})).status).toBe(429)
  })
})
