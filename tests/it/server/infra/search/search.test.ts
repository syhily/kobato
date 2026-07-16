import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

const mocks = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/server/infra/search/openai', () => ({
  generateEmbedding: mocks.generateEmbedding,
}))

vi.mock('@/server/infra/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/logger')>()
  const makeStub = (): typeof actual.logger => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mocks.warn,
    error: vi.fn(),
    fatal: vi.fn(),
    child: () => makeStub(),
    withScope: () => makeStub(),
  })
  return {
    ...actual,
    logger: makeStub(),
    getLogger: () => makeStub(),
  }
})

const { searchPosts, __setTrgmAvailabilityForTests } = await import('@/server/infra/search/search')
const { getPostsBySlugs } = await import('@/server/domains/posts/repos/public-query/misc')
const { searchPostOptions } = await import('@/server/infra/search/options')
const { liveContentWhere } = await import('@/server/domains/content/schema')
const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/services/test-utils')
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
  await flushWorkerRedis()
  mocks.generateEmbedding.mockReset()
  mocks.warn.mockClear()
  __setTrgmAvailabilityForTests(null)
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

function enableVectorMode() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    search: {
      search: {
        enabled: true,
        mode: 'vector',
        endpoint: '',
        apiKey: 'sk-test',
        model: 'text-embedding-3-small',
        similarityThreshold: 0.5,
        trgmThreshold: 0.3,
      },
    },
  })
}

function enableTrgmMode(trgmThreshold = 0.3) {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    search: {
      search: {
        enabled: false,
        mode: 'trgm',
        endpoint: '',
        apiKey: '',
        model: 'text-embedding-3-small',
        similarityThreshold: 0.5,
        trgmThreshold,
      },
    },
  })
}

// Measured on the test Postgres (pg_trgm 1.6): word_similarity scores
// for these fixtures are ≈0.83 (title), ≈0.50 (verbatim body) and
// ≈0.37 (scattered body) against the queries used below.
const CJK_BODY = '今天我们来聊聊向量数据库的入门知识，包括 HNSW 索引与 IVF 索引的取舍，以及在实际生产环境中如何调优。'
const CJK_BODY_SCATTERED = '今天我们来聊聊向量数据库的入门知识，包括 HNSW 索引的取舍，以及在生产环境中如何调优。'
const UNRELATED_BODY = '这篇文章完全不相关，讲的是厨房收纳与整理技巧。'

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
    expect(mocks.generateEmbedding).not.toHaveBeenCalled()
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

  it('uses vector mode when enabled and embedding succeeds, falls back to LIKE results', async () => {
    enableVectorMode()
    mocks.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3])

    await seedPost({ slug: 'vector-match-1', title: 'Semantic One' })
    await seedPost({ slug: 'vector-match-2', title: 'Semantic Two' })

    const result = await searchPosts(db, liveWhere(), 'semantic', 10)

    expect(mocks.generateEmbedding).toHaveBeenCalledWith('semantic')
    // Vector search won't match because no embeddings in DB,
    // but LIKE should still find the titles containing 'semantic'
    expect(result.hits).toContain('vector-match-1')
    expect(result.hits).toContain('vector-match-2')
  })

  it('falls back to LIKE when vector mode is enabled but embedding fails', async () => {
    enableVectorMode()
    mocks.generateEmbedding.mockResolvedValue(null)

    await seedPost({ slug: 'like-fallback', title: 'Test Fallback' })

    const result = await searchPosts(db, liveWhere(), 'test', 10)

    expect(mocks.generateEmbedding).toHaveBeenCalled()
    expect(result.hits).toEqual(['like-fallback'])
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

describe('services/search — searchPosts (trgm mode)', () => {
  it('ranks by word similarity, not date, and excludes non-matching posts', async () => {
    enableTrgmMode()
    const now = new Date()
    // Newer but only a body match (word_similarity ≈0.5) …
    await seedPost({ slug: 'trgm-body-match', title: '数据库随笔', plainText: CJK_BODY, publishedAt: now })
    // … older but a title match (word_similarity ≈0.83) — must rank first.
    await seedPost({
      slug: 'trgm-title-match',
      title: '向量数据库入门',
      publishedAt: new Date(now.getTime() - 1000),
    })
    await seedPost({ slug: 'trgm-no-match', title: '厨房收纳整理', plainText: UNRELATED_BODY })

    const result = await searchPosts(db, liveWhere(), '向量数据库', 10)

    expect(result.hits).toEqual(['trgm-title-match', 'trgm-body-match'])
    expect(mocks.generateEmbedding).not.toHaveBeenCalled()
  })

  it('matches scattered CJK terms that LIKE cannot (non-contiguous substring)', async () => {
    await seedPost({ slug: 'trgm-cjk-fuzzy', title: '调优手记', plainText: CJK_BODY_SCATTERED })

    // Control: LIKE mode misses — the query chars are not contiguous.
    const likeResult = await searchPosts(db, liveWhere(), '向量数据库调优', 10)
    expect(likeResult.hits).toEqual([])

    // trgm mode: word_similarity ≈0.37 ≥ 0.3 threshold.
    enableTrgmMode()
    const trgmResult = await searchPosts(db, liveWhere(), '向量数据库调优', 10)
    expect(trgmResult.hits).toEqual(['trgm-cjk-fuzzy'])
  })

  it('respects the trgmThreshold knob (and keys the cache by it)', async () => {
    await seedPost({ slug: 'trgm-threshold', title: '调优手记', plainText: CJK_BODY_SCATTERED })

    enableTrgmMode(0.9)
    const strict = await searchPosts(db, liveWhere(), '向量数据库调优', 10)
    expect(strict.hits).toEqual([])

    enableTrgmMode(0.3)
    const relaxed = await searchPosts(db, liveWhere(), '向量数据库调优', 10)
    expect(relaxed.hits).toEqual(['trgm-threshold'])
  })

  it('degrades to LIKE with a one-time warning when pg_trgm is unavailable', async () => {
    enableTrgmMode()
    __setTrgmAvailabilityForTests(false)
    await seedPost({ slug: 'trgm-fallback', title: 'Test Fallback' })

    const first = await searchPosts(db, liveWhere(), 'test', 10)
    const second = await searchPosts(db, liveWhere(), 'fallback', 10)

    expect(first.hits).toEqual(['trgm-fallback'])
    expect(second.hits).toEqual(['trgm-fallback'])
    expect(mocks.generateEmbedding).not.toHaveBeenCalled()
    const trgmWarnings = mocks.warn.mock.calls.filter(
      ([message]) => typeof message === 'string' && message.includes('pg_trgm'),
    )
    expect(trgmWarnings).toHaveLength(1)
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
