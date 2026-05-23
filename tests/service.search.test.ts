import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/server/infra/db/pool'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'

import { clearAllTables } from './_helpers/integration-db'
import { flushWorkerRedis } from './_helpers/redis'

const mocks = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
}))

vi.mock('@/server/infra/search/openai', () => ({
  generateEmbedding: mocks.generateEmbedding,
}))

const { searchPosts } = await import('@/server/infra/search/search')
const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/snapshot')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('./_helpers/blog-settings')

beforeEach(async () => {
  await clearAllTables(db)
  await flushWorkerRedis()
  mocks.generateEmbedding.mockReset()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

async function seedPost(overrides: Partial<typeof post.$inferInsert> = {}) {
  const rows = await db
    .insert(post)
    .values({
      slug: 'test-post',
      title: 'Test Post',
      summary: 'A test summary',
      publishedAt: overrides.publishedAt ?? new Date(),
      ...overrides,
    })
    .returning()
  await db.insert(postSearchIndex).values({
    postId: rows[0].id,
    plainText: overrides.summary ?? 'A test summary',
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
      },
    },
  })
}

describe('services/search — searchPosts', () => {
  it('returns empty results for empty query', async () => {
    const result = await searchPosts('', 10)
    expect(result.hits).toEqual([])
    expect(result.totalPages).toBe(0)
  })

  it('uses LIKE mode by default', async () => {
    await seedPost({ slug: 'post-with-phrase', title: '向量数据库入门' })
    await seedPost({ slug: 'another-post', title: '另一个文章' })

    const result = await searchPosts('向量数据库', 10)

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

    const result = await searchPosts('test', 2, 1)

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

    const result = await searchPosts('semantic', 10)

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

    const result = await searchPosts('test', 10)

    expect(mocks.generateEmbedding).toHaveBeenCalled()
    expect(result.hits).toEqual(['like-fallback'])
  })
})
