import type { AppLocale } from '@kobato/i18n/locales'

import { APP_VERSION } from '@kobato/base/distribution/app'
import { sqliteOf } from '@kobato/db/sqlite/database'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import { postTag } from '@kobato/db/sqlite/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@kobato/db/sqlite/schema/taxonomy'
import { countEntryFiles, wipeCache } from '@kobato/server/infra/cache/file-store'
import { __resetMemoryCacheForTests } from '@kobato/server/infra/cache/memory-store'
import { get, resetCacheCounterMemo } from '@kobato/server/infra/cache/registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { callRpc, parseRpcJson } from '@kobato/server/tests/utils/rpc-call'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateFeeds = vi.spyOn(await import('@kobato/server/render/feed/generator'), 'generateFeeds')

const db = getTestDb()

interface FeedAnswer {
  kind: 'ok'
  body: string
  etag: string
  contentType: string
  cacheControl: string
  contentLanguage: string
}

interface FeedNotModified {
  kind: 'not-modified'
  etag: string
  contentType: string
  cacheControl: string
  contentLanguage: string
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

async function seedFeedPost(slug: string, categoryId?: number, tagId?: number): Promise<void> {
  const rows = await sqliteOf(db)
    .insert(postTable)
    .values({
      slug,
      title: slug,
      summary: 'feed summary',
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      visible: true,
      categoryId: categoryId ?? null,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  if (tagId !== undefined) {
    await sqliteOf(db).insert(postTag).values({ postId, tagId })
  }
  const revisions = await sqliteOf(db)
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await sqliteOf(db).update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
}

async function seedCategory(slug: string): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(categoryTable)
    .values({ name: slug, slug, cover: '' })
    .returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function seedTag(slug: string): Promise<number> {
  const rows = await sqliteOf(db).insert(tagTable).values({ name: slug, slug }).returning({ id: tagTable.id })
  return rows[0]!.id
}

async function callFeed(path: string, input: Record<string, unknown>): Promise<Response> {
  return callRpc(path, input, makePublicCtx({ db }))
}

beforeEach(async () => {
  generateFeeds.mockClear()
  __resetRateLimitsForTests()
  await clearAllTables(db)
  await wipeCache()
  __resetMemoryCacheForTests()
  resetCacheCounterMemo()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await seedFeedPost('hello-feed')
})

describe('public.feeds — the six feed URLs as one procedure family', () => {
  it('answers /feed with a real rss feed carrying the captured representation', async () => {
    const res = await callFeed('/public/feeds/rss', {})
    expect(res.status).toBe(200)
    const answer = await parseRpcJson<FeedAnswer>(res)
    expect(answer.kind).toBe('ok')
    expect(answer.contentType).toBe('application/xml; charset=utf-8')
    expect(answer.cacheControl).toBe('public, no-cache')
    expect(answer.contentLanguage).toBe('zh-CN')
    expect(answer.etag).toMatch(/^"[0-9a-f]{32}"$/)
    expect(answer.body).toContain('<rss')
    expect(answer.body).toContain('hello-feed')
  })

  it('answers /feed/atom with the atom content type', async () => {
    const res = await callFeed('/public/feeds/atom', {})
    const answer = await parseRpcJson<FeedAnswer>(res)
    expect(answer.contentType).toBe('application/atom+xml; charset=utf-8')
    expect(answer.body).toContain('<feed')
    expect(answer.body).toContain('hello-feed')
  })

  it('answers a category feed when the scope resolves', async () => {
    const categoryId = await seedCategory('code')
    await seedFeedPost('code-post', categoryId)
    const res = await callFeed('/public/feeds/rss', { category: 'code' })
    const answer = await parseRpcJson<FeedAnswer>(res)
    expect(answer.kind).toBe('ok')
    expect(answer.body).toContain('code-post')
    expect(answer.body).not.toContain('hello-feed')
  })

  it('answers a tag feed when the scope resolves', async () => {
    const tagId = await seedTag('ai')
    await seedFeedPost('tagged-post', undefined, tagId)
    const res = await callFeed('/public/feeds/atom', { tag: 'ai' })
    const answer = await parseRpcJson<FeedAnswer>(res)
    expect(answer.kind).toBe('ok')
    expect(answer.body).toContain('tagged-post')
  })

  it('answers NOT_FOUND for an unknown category scope', async () => {
    const res = await callFeed('/public/feeds/rss', { category: 'nope' })
    expect(res.status).toBe(404)
  })

  it('answers NOT_FOUND for an unknown tag scope', async () => {
    const res = await callFeed('/public/feeds/atom', { tag: 'nope' })
    expect(res.status).toBe(404)
  })
})

describe('public.feeds — conditional requests and caching', () => {
  it('answers not-modified with the same representation on a matching ifNoneMatch', async () => {
    const first = await parseRpcJson<FeedAnswer>(await callFeed('/public/feeds/rss', {}))
    await waitForCachedFeed('all')

    const second = await parseRpcJson<FeedNotModified>(await callFeed('/public/feeds/rss', { ifNoneMatch: first.etag }))

    expect(second.kind).toBe('not-modified')
    expect(second.etag).toBe(first.etag)
    expect(second.contentType).toBe(first.contentType)
    expect(second.cacheControl).toBe(first.cacheControl)
    expect(second.contentLanguage).toBe(first.contentLanguage)
    expect(generateFeeds).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale ifNoneMatch and answers ok', async () => {
    const answer = await parseRpcJson<FeedAnswer>(await callFeed('/public/feeds/rss', { ifNoneMatch: '"stale"' }))
    expect(answer.kind).toBe('ok')
  })

  it('weak-comparable ifNoneMatch (the compressed 200 header) still matches', async () => {
    const first = await parseRpcJson<FeedAnswer>(await callFeed('/public/feeds/rss', {}))
    const weak = `W/${first.etag}`
    const second = await parseRpcJson<FeedNotModified>(await callFeed('/public/feeds/rss', { ifNoneMatch: weak }))
    expect(second.kind).toBe('not-modified')
    expect(second.etag).toBe(first.etag)
  })

  it('serves a cache hit without regenerating the feed and keeps the etag stable', async () => {
    const first = await parseRpcJson<FeedAnswer>(await callFeed('/public/feeds/rss', {}))
    expect(generateFeeds).toHaveBeenCalledTimes(1)
    await waitForCachedFeed('all')

    const second = await parseRpcJson<FeedAnswer>(await callFeed('/public/feeds/rss', {}))

    expect(generateFeeds).toHaveBeenCalledTimes(1)
    expect(second.etag).toBe(first.etag)
    expect(second.body).toBe(first.body)
  })

  it('namespaces the cache entry per scope', async () => {
    const categoryId = await seedCategory('tech')
    const tagId = await seedTag('tech')
    await seedFeedPost('tech-post', categoryId, tagId)
    await callFeed('/public/feeds/rss', { category: 'tech' })
    await waitForCachedFeed('cat:tech')
    expect(await get('feed', feedParams('all'))).toBeNull()

    await callFeed('/public/feeds/atom', { tag: 'tech' })
    await vi.waitFor(async () => {
      const cached = await get<'feed', { rss: string; atom: string }>('feed', feedParams('tag:tech'))
      expect(cached?.atom).toContain('<feed')
    })
    expect(await countEntryFiles('feed')).toBe(2)
  })

  it('keys the en-US variant separately from zh-CN', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'en-US' },
    })
    const en = await parseRpcJson<FeedAnswer>(await callFeed('/public/feeds/rss', {}))
    expect(en.contentLanguage).toBe('en-US')
    await waitForCachedFeed('all', 'en-US')
    expect(await get('feed', feedParams('all', 'zh-CN'))).toBeNull()
  })
})

describe('public.feeds — rate limits', () => {
  it('returns 429 when the feed bucket is exhausted and keeps the sitemap bucket separate', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    expect((await callFeed('/public/feeds/rss', {})).status).toBe(200)
    expect((await callFeed('/public/feeds/rss', {})).status).toBe(429)
    expect((await callFeed('/public/feeds/atom', {})).status).toBe(429)

    const sitemap = await callRpc('/public/sitemap/xml', {}, makePublicCtx({ db }))
    expect(sitemap.status).toBe(200)
  })
})
