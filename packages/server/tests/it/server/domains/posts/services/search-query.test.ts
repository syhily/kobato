import { sqliteOf } from '@kobato/db/database'
import { postSearchIndex } from '@kobato/db/schema/content'
import { post } from '@kobato/db/schema/post'
import { likeCacheKeyParts } from '@kobato/server/domains/posts/services/search-query'
import { countEntryFiles, resolveCacheRoot } from '@kobato/server/infra/cache/file-store'
import { get } from '@kobato/server/infra/cache/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

const { searchPosts } = await import('@kobato/server/domains/posts/services/search-query')
const { bumpCounter, getCounter, __resetCacheCountersForTests } = await import('@kobato/server/infra/cache/registry')
const { __logCaptureForTests, __clearLogCaptureForTests } = await import('@kobato/server/infra/logger')
const { getPostsBySlugs } = await import('@kobato/server/domains/posts/services/public-query')
const { searchPostOptions } = await import('@kobato/server/domains/posts/services/search-query')
const { setBlogSettingsBundleForTests } = await import('@kobato/settings/tests/utils/blog-settings')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('@kobato/settings/tests/utils/blog-settings')

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  __resetCacheCountersForTests()
  __clearLogCaptureForTests()
})

async function seedPost({ plainText, ...overrides }: Partial<typeof post.$inferInsert> & { plainText?: string } = {}) {
  const rows = await sqliteOf(db)
    .insert(post)
    .values({
      slug: 'test-post',
      title: 'Test Post',
      summary: 'A test summary',
      publishedAt: overrides.publishedAt ?? new Date(),
      publishedRevisionId: 1,
      ...overrides,
    })
    .returning()
  await sqliteOf(db)
    .insert(postSearchIndex)
    .values({
      postId: rows[0].id,
      plainText: plainText ?? overrides.summary ?? 'A test summary',
    })
  return rows[0]
}

describe('services/search — searchPosts', () => {
  it('returns empty results for empty query', async () => {
    const result = await searchPosts(db, '', 10)
    expect(result.hits).toEqual([])
    expect(result.totalPages).toBe(0)
  })

  it('uses LIKE mode by default', async () => {
    await seedPost({ slug: 'post-with-phrase', title: '向量数据库入门' })
    await seedPost({ slug: 'another-post', title: '另一个文章' })

    const result = await searchPosts(db, '向量数据库', 10)

    expect(result.hits).toEqual(['post-with-phrase'])
    expect(result.totalPages).toBe(1)
  })

  it('paginates LIKE results', async () => {
    const now = new Date()
    await seedPost({
      slug: 'post-a',
      title: 'Test A',
      publishedAt: new Date(now.getTime() - 2000),
    })
    await seedPost({
      slug: 'post-b',
      title: 'Test B',
      publishedAt: new Date(now.getTime() - 1000),
    })
    await seedPost({ slug: 'post-c', title: 'Test C', publishedAt: now })

    const result = await searchPosts(db, 'test', 2, 1)

    expect(result.hits).toEqual(['post-b', 'post-a'])
    expect(result.page).toBe(1)
    expect(result.totalPages).toBe(2)
  })

  it('applies the environment scheduled-post policy', async () => {
    await seedPost({
      slug: 'scheduled',
      title: 'Scheduled Test',
      publishedAt: new Date(Date.now() + 86_400_000),
    })

    const result = await searchPosts(db, 'scheduled', 10)
    expect(result.hits).toEqual(searchPostOptions().includeScheduled ? ['scheduled'] : [])
  })

  it('excludes published posts without a published revision', async () => {
    await seedPost({ slug: 'no-revision', title: 'No Revision Test', publishedRevisionId: null })

    const result = await searchPosts(db, 'revision', 10)
    expect(result.hits).toEqual([])
  })
})

async function waitForCachedSearch(query: string, generation: number): Promise<void> {
  await vi.waitFor(async () => {
    expect(await get('searchResult', { generation, parts: likeCacheKeyParts(query) })).not.toBeNull()
  })
}

describe('services/search — search result cache invalidation', () => {
  it('serves fresh results after the search generation is bumped', async () => {
    await seedPost({ slug: 'cache-alpha', title: 'Cache Alpha' })

    const first = await searchPosts(db, 'cache', 10)
    expect(first.hits).toEqual(['cache-alpha'])
    await waitForCachedSearch('cache', 0)

    await seedPost({ slug: 'cache-beta', title: 'Cache Beta' })
    const stale = await searchPosts(db, 'cache', 10)
    expect(stale.hits).toEqual(['cache-alpha'])

    await bumpCounter('searchResult')
    const fresh = await searchPosts(db, 'cache', 10)
    expect(fresh.hits).toEqual(['cache-beta', 'cache-alpha'])
    await waitForCachedSearch('cache', 1)

    await seedPost({ slug: 'cache-gamma', title: 'Cache Gamma' })
    const staleAgain = await searchPosts(db, 'cache', 10)
    expect(staleAgain.hits).toEqual(['cache-beta', 'cache-alpha'])

    await bumpCounter('searchResult')
    const freshAgain = await searchPosts(db, 'cache', 10)
    expect(freshAgain.hits).toEqual(['cache-gamma', 'cache-beta', 'cache-alpha'])
  })
})

describe('services/search — searchResult cache rows (real registry)', () => {
  it('stamps cached entries with the current generation and never writes the counter on reads', async () => {
    await seedPost({ slug: 'gen-post', title: 'Generation Probe' })

    expect(await getCounter('searchResult')).toBe(0)

    const result = await searchPosts(db, 'generation', 10)
    expect(result.hits).toEqual(['gen-post'])

    await vi.waitFor(async () => {
      expect(await get('searchResult', { generation: 0, parts: likeCacheKeyParts('generation') })).not.toBeNull()
    })
    expect(await get('searchResult', { generation: 1, parts: likeCacheKeyParts('generation') })).toBeNull()
    expect(existsSync(path.join(resolveCacheRoot(), 'searchResult', '_generation'))).toBe(false)
  })

  it('serves a later page from the same cached slug list without a second entry', async () => {
    const now = new Date()
    await seedPost({ slug: 'page-a', title: 'Paged A', publishedAt: new Date(now.getTime() - 2000) })
    await seedPost({ slug: 'page-b', title: 'Paged B', publishedAt: new Date(now.getTime() - 1000) })
    await seedPost({ slug: 'page-c', title: 'Paged C', publishedAt: now })

    const first = await searchPosts(db, 'paged', 2, 0)
    expect(first.hits).toEqual(['page-c', 'page-b'])
    await waitForCachedSearch('paged', 0)

    const second = await searchPosts(db, 'paged', 2, 2)
    expect(second.hits).toEqual(['page-a'])
    expect(second.page).toBe(2)
    expect(second.totalPages).toBe(2)

    expect(await countEntryFiles('searchResult')).toBe(1)
  })

  it('logs a cache hit on a repeated identical query', async () => {
    await seedPost({ slug: 'hit-post', title: 'Hit Probe' })

    await searchPosts(db, 'hit probe', 10)
    await vi.waitFor(async () => {
      expect(await get('searchResult', { generation: 0, parts: likeCacheKeyParts('hit probe') })).not.toBeNull()
    })
    await searchPosts(db, 'hit probe', 10)

    const hits = __logCaptureForTests().filter((entry) => entry.msg === 'Search result cache hit')
    expect(hits).toHaveLength(1)
    expect(hits[0].ctx).toEqual({ query: 'hit probe', total: 1 })
  })
})

describe('services/search — getPostsBySlugs', () => {
  it('returns hydrated posts in the caller slug order, not date order', async () => {
    const now = new Date()
    await seedPost({ slug: 'alpha-match', title: 'alpha match', publishedAt: now })
    await seedPost({
      slug: 'match-beta',
      title: 'match beta',
      publishedAt: new Date(now.getTime() - 1000),
    })
    await seedPost({
      slug: 'match-gamma',
      title: 'match gamma',
      publishedAt: new Date(now.getTime() - 2000),
    })

    const posts = await getPostsBySlugs(db, ['match-gamma', 'alpha-match', 'match-beta'], searchPostOptions())

    expect(posts.map((p) => p.slug)).toEqual(['match-gamma', 'alpha-match', 'match-beta'])
  })

  it('excludes published rows that never had a revision promoted', async () => {
    await seedPost({
      slug: 'never-promoted',
      title: 'Never Promoted',
      published: true,
      publishedRevisionId: null,
    })
    await seedPost({ slug: 'promoted-live', title: 'Promoted Live', publishedRevisionId: 1 })

    const posts = await getPostsBySlugs(db, ['never-promoted', 'promoted-live'], searchPostOptions())

    expect(posts.map((p) => p.slug)).toEqual(['promoted-live'])
  })
})
