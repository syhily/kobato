import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

const { searchPosts } = await import('@/server/infra/search/search')
const { bumpCounter } = await import('@/server/infra/cache/registry')
const { getPostsBySlugs } = await import('@/server/domains/posts/services/public-query')
const { searchPostOptions } = await import('@/server/infra/search/options')
const { liveContentWhere } = await import('@/server/domains/content/schemas/live-gate')
const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

/** The same caller-supplied live gate the production search loader passes. */
function liveWhere() {
  return liveContentWhere({
    deletedAt: post.deletedAt,
    published: post.published,
    publishedRevisionId: post.publishedRevisionId,
    publishedAt: post.publishedAt,
  })
}

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

async function seedPost({ plainText, ...overrides }: Partial<typeof post.$inferInsert> & { plainText?: string } = {}) {
  const rows = await db
    .insert(post)
    .values({
      slug: 'test-post',
      title: 'Test Post',
      summary: 'A test summary',
      publishedAt: overrides.publishedAt ?? new Date(),
      publishedRevisionId: 1n,
      ...overrides,
    })
    .returning()
  await db.insert(postSearchIndex).values({
    postId: rows[0].id,
    plainText: plainText ?? overrides.summary ?? 'A test summary',
  })
  return rows[0]
}

describe('services/search — searchPosts', () => {
  it('returns empty results for empty query', async () => {
    const result = await searchPosts(db, liveWhere(), '', 10)
    expect(result.hits).toEqual([])
    expect(result.totalPages).toBe(0)
  })

  it('uses LIKE mode by default', async () => {
    await seedPost({ slug: 'post-with-phrase', title: '向量数据库入门' })
    await seedPost({ slug: 'another-post', title: '另一个文章' })

    const result = await searchPosts(db, liveWhere(), '向量数据库', 10)

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

    const result = await searchPosts(db, liveWhere(), 'test', 2, 1)

    // Ordered by publishedAt DESC: post-c, post-b, post-a
    // offset=1, limit=2 → post-b, post-a
    expect(result.hits).toEqual(['post-b', 'post-a'])
    expect(result.page).toBe(1)
    expect(result.totalPages).toBe(2)
  })

  it('excludes scheduled posts (publishedAt in the future)', async () => {
    await seedPost({
      slug: 'scheduled',
      title: 'Scheduled Test',
      publishedAt: new Date(Date.now() + 86_400_000),
    })

    const result = await searchPosts(db, liveWhere(), 'scheduled', 10)
    expect(result.hits).toEqual([])
  })

  it('excludes published posts without a published revision', async () => {
    await seedPost({ slug: 'no-revision', title: 'No Revision Test', publishedRevisionId: null })

    const result = await searchPosts(db, liveWhere(), 'revision', 10)
    expect(result.hits).toEqual([])
  })
})

describe('services/search — search result cache invalidation', () => {
  it('serves fresh results after the search generation is bumped', async () => {
    await seedPost({ slug: 'cache-alpha', title: 'Cache Alpha' })

    // First query populates the result cache …
    const first = await searchPosts(db, liveWhere(), 'cache', 10)
    expect(first.hits).toEqual(['cache-alpha'])

    // … a corpus change stays invisible while the cached entry lives.
    await seedPost({ slug: 'cache-beta', title: 'Cache Beta' })
    const stale = await searchPosts(db, liveWhere(), 'cache', 10)
    expect(stale.hits).toEqual(['cache-alpha'])

    // Invalidation bumps the generation stamp, so the next query misses
    // the old-generation entry and re-runs against the corpus.
    await bumpCounter(db, 'searchResult')
    const fresh = await searchPosts(db, liveWhere(), 'cache', 10)
    expect(fresh.hits).toEqual(['cache-beta', 'cache-alpha'])

    // The counter row now exists, so a second bump takes the
    // ON CONFLICT DO UPDATE branch (value::int + 1) — and invalidates
    // all over again.
    await seedPost({ slug: 'cache-gamma', title: 'Cache Gamma' })
    const staleAgain = await searchPosts(db, liveWhere(), 'cache', 10)
    expect(staleAgain.hits).toEqual(['cache-beta', 'cache-alpha'])

    await bumpCounter(db, 'searchResult')
    const freshAgain = await searchPosts(db, liveWhere(), 'cache', 10)
    expect(freshAgain.hits).toEqual(['cache-gamma', 'cache-beta', 'cache-alpha'])
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
    await seedPost({ slug: 'promoted-live', title: 'Promoted Live', publishedRevisionId: 1n })

    const posts = await getPostsBySlugs(db, ['never-promoted', 'promoted-live'], searchPostOptions())

    expect(posts.map((p) => p.slug)).toEqual(['promoted-live'])
  })
})
