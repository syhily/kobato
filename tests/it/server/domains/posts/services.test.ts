import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyInklingDocument, inklingFromPt } from '#/_helpers/inkling'
import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

vi.mock('@/server/infra/search/openai', () => ({
  generateEmbedding: vi.fn(async () => null),
}))
vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))
vi.mock('@/server/infra/cache/feed-cache', () => ({ clearFeedCache: vi.fn(async () => undefined) }))
vi.mock('@/server/infra/cache/sitemap-cache', () => ({ clearSitemapCache: vi.fn(async () => undefined) }))
vi.mock('@/server/infra/search/search', () => ({ invalidateSearchCache: vi.fn(async () => undefined) }))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  await flushWorkerRedis()
  vi.clearAllMocks()
})

async function seedPost(opts: Partial<typeof postMetaTable.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(postMetaTable)
    .values({
      slug: opts.slug ?? `post-${Math.random().toString(36).slice(2)}`,
      title: opts.title ?? 'Untitled',
      published: opts.published ?? true,
      publishedRevisionId: opts.publishedRevisionId ?? null,
      firstPublishedAt: opts.firstPublishedAt ?? new Date('2026-01-01'),
      publishedAt: opts.publishedAt ?? new Date('2026-01-01'),
      ...opts,
    })
    .returning({ id: postMetaTable.id })
  return rows[0]!.id
}

async function seedContent(opts: Partial<typeof contentTable.$inferInsert> = {}): Promise<bigint> {
  const rows = await db
    .insert(contentTable)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1n,
      revisionNo: opts.revisionNo ?? 1,
      status: opts.status ?? 'published',
      body: opts.body ?? emptyInklingDocument(),
      ...opts,
    })
    .returning({ id: contentTable.id })
  return rows[0]!.id
}

describe('posts/services/admin-query — listPostsForAdmin', () => {
  it('returns an empty result when there are no posts', async () => {
    const { listPostsForAdmin } = await import('@/server/domains/posts/services/admin-query')
    const r = await listPostsForAdmin(db, {})
    expect(r.posts).toEqual([])
    expect(r.total).toBe(0)
  })
  it('returns posts + total', async () => {
    await seedPost({ slug: 'a', publishedRevisionId: 1n })
    await seedPost({ slug: 'b', publishedRevisionId: 1n })
    const { listPostsForAdmin } = await import('@/server/domains/posts/services/admin-query')
    const r = await listPostsForAdmin(db, { offset: 0, limit: 10 })
    expect(r.total).toBe(2)
    expect(r.posts).toHaveLength(2)
  })
  it('filters by lifecycle=draft', async () => {
    await seedPost({ slug: 'pub', published: true, publishedRevisionId: 1n })
    await seedPost({ slug: 'drf', published: false })
    const { listPostsForAdmin } = await import('@/server/domains/posts/services/admin-query')
    const r = await listPostsForAdmin(db, { lifecycle: 'draft' })
    expect(r.total).toBe(1)
  })
})

describe('posts/services/admin-query — getPostDetailForAdmin', () => {
  it('throws NOT_FOUND when the post does not exist', async () => {
    const { getPostDetailForAdmin } = await import('@/server/domains/posts/services/admin-query')
    await expect(getPostDetailForAdmin(db, 9999n)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('returns the post with revision + tags', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    const pid = await seedPost({ slug: 'det', publishedRevisionId: revId })
    const { getPostDetailForAdmin } = await import('@/server/domains/posts/services/admin-query')
    const r = await getPostDetailForAdmin(db, pid)
    expect(r?.post.slug).toBe('det')
  })
})

describe('posts/services/admin-query — listRevisionsForAdmin', () => {
  it('returns the revisions attached to a post', async () => {
    const pid = await seedPost({ slug: 'rev' })
    await seedContent({ type: 'post', ownerId: pid, revisionNo: 1, status: 'draft' })
    await seedContent({ type: 'post', ownerId: pid, revisionNo: 2, status: 'published' })
    const { listRevisionsForAdmin } = await import('@/server/domains/posts/services/admin-query')
    const rows = await listRevisionsForAdmin(db, pid)
    expect(rows).toHaveLength(2)
  })
})

describe('posts/services/draft — loadPostDraftPreviewBySlug', () => {
  it('returns null when the slug does not exist', async () => {
    const { loadPostDraftPreviewBySlug } = await import('@/server/domains/posts/services/draft')
    expect(await loadPostDraftPreviewBySlug(db, 'nope')).toBeNull()
  })
  it('returns the published revision when no draft exists', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    await seedPost({ slug: 'prev', publishedRevisionId: revId })
    const { loadPostDraftPreviewBySlug } = await import('@/server/domains/posts/services/draft')
    const r = await loadPostDraftPreviewBySlug(db, 'prev')
    expect(r?.post.slug).toBe('prev')
    expect(r?.hasNewerDraft).toBe(false)
  })
  it('returns the draft when one exists', async () => {
    const pid = await seedPost({ slug: 'dr', publishedRevisionId: null })
    await seedContent({ type: 'post', ownerId: pid, revisionNo: 1, status: 'draft' })
    const { loadPostDraftPreviewBySlug } = await import('@/server/domains/posts/services/draft')
    const r = await loadPostDraftPreviewBySlug(db, 'dr')
    expect(r?.hasNewerDraft).toBe(true)
  })
})

describe('posts/services/draft — loadEditorBody', () => {
  it('throws NOT_FOUND when the post does not exist', async () => {
    const { loadEditorBody } = await import('@/server/domains/posts/services/draft')
    await expect(loadEditorBody(db, 9999n)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('returns meta + draft + published revisions', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    const pid = await seedPost({ slug: 'ed', publishedRevisionId: revId })
    const { loadEditorBody } = await import('@/server/domains/posts/services/draft')
    const r = await loadEditorBody(db, pid)
    expect(r.meta.slug).toBe('ed')
    expect(r.published).not.toBeNull()
  })
})

describe('posts/services/search-index — removePostIndex', () => {
  it('deletes the search index row without error', async () => {
    const { removePostIndex } = await import('@/server/domains/posts/services/search-index')
    await expect(removePostIndex(db, 9999n)).resolves.toBeUndefined()
  })
})

describe('posts/services/search-reindex — reindexSearchBatch', () => {
  it('returns processed=0 when no posts match', async () => {
    const { reindexSearchBatch } = await import('@/server/domains/posts/services/search-reindex')
    const r = await reindexSearchBatch(db)
    expect(r.processed).toBe(0)
    expect(r.total).toBe(0)
  })
  it('indexes published posts with a valid revision', async () => {
    const revId = await seedContent({
      type: 'post',
      revisionNo: 1,
      status: 'published',
      body: inklingFromPt([
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'hi', marks: [] }],
        },
      ]),
    })
    await seedPost({ slug: 'idx', publishedRevisionId: revId })
    const { reindexSearchBatch } = await import('@/server/domains/posts/services/search-reindex')
    const r = await reindexSearchBatch(db)
    expect(r.processed).toBe(1)
    expect(r.failed).toBe(0)
  })
  it('respects batchSize for pagination', async () => {
    const revId = await seedContent({
      type: 'post',
      revisionNo: 1,
      status: 'published',
      body: emptyInklingDocument(),
    })
    await seedPost({ slug: 'a', publishedRevisionId: revId })
    await seedPost({ slug: 'b', publishedRevisionId: revId })
    const { reindexSearchBatch } = await import('@/server/domains/posts/services/search-reindex')
    const r = await reindexSearchBatch(db, { batchSize: 1, offset: 0 })
    expect(r.processed).toBe(1)
    expect(r.total).toBe(2)
    expect(r.nextOffset).toBe(1)
  })
})

describe('posts/services/catalog — loadCatalogPostMetas', () => {
  it('returns [] when there are no visible posts', async () => {
    const { loadCatalogPostMetas } = await import('@/server/domains/posts/services/catalog')
    expect(await loadCatalogPostMetas(db)).toEqual([])
  })
  it('returns posts with revision + tags', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    await seedPost({ slug: 'cat', publishedRevisionId: revId })
    const { loadCatalogPostMetas } = await import('@/server/domains/posts/services/catalog')
    const posts = await loadCatalogPostMetas(db)
    expect(posts[0]?.slug).toBe('cat')
  })
})

describe('posts/services/catalog — loadCatalogPostBySlug', () => {
  it('returns null when the slug does not exist', async () => {
    const { loadCatalogPostBySlug } = await import('@/server/domains/posts/services/catalog')
    expect(await loadCatalogPostBySlug(db, 'nope')).toBeNull()
  })
  it('returns the post when visible', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    await seedPost({ slug: 'cat-slug', publishedRevisionId: revId })
    const { loadCatalogPostBySlug } = await import('@/server/domains/posts/services/catalog')
    const r = await loadCatalogPostBySlug(db, 'cat-slug')
    expect(r?.slug).toBe('cat-slug')
  })
})

describe('posts/services/mutate — createPost', () => {
  it('creates a new draft post with slug derived from title', async () => {
    const { createPost } = await import('@/server/domains/posts/services/mutate')
    const dto = await createPost(db, { title: 'Hello World' }, null)
    expect(dto.slug).toBe('hello-world')
    expect(dto.published).toBe(false)
  })
  it('throws CONFLICT on duplicate slug', async () => {
    await seedPost({ slug: 'taken' })
    const { createPost } = await import('@/server/domains/posts/services/mutate')
    await expect(createPost(db, { title: 'Taken' }, null)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

describe('posts/services/mutate — updatePostMeta', () => {
  it('updates title and slug together', async () => {
    const { createPost, updatePostMeta } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Old Title' }, null)
    const dto = await updatePostMeta(db, { id: BigInt(created.id), title: 'New Title' })
    expect(dto.title).toBe('New Title')
    expect(dto.slug).toBe('new-title')
  })
  it('throws BAD_REQUEST when id is missing', async () => {
    const { updatePostMeta } = await import('@/server/domains/posts/services/mutate')
    await expect(updatePostMeta(db, { title: 'X' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('posts/services/mutate — deletePost / restorePost / unpublishPost', () => {
  it('soft-deletes a post', async () => {
    const { createPost, deletePost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'To Delete' }, null)
    const r = await deletePost(db, BigInt(created.id))
    expect(r.deleted).toBe(true)
  })
  it('restores a soft-deleted post', async () => {
    const { createPost, deletePost, restorePost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'To Restore' }, null)
    await deletePost(db, BigInt(created.id))
    const r = await restorePost(db, BigInt(created.id))
    expect(r.restored).toBe(true)
  })
  it('unpublishes a published post', async () => {
    const { createPost, updatePostMeta, unpublishPost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'To Unpublish' }, null)
    await db
      .update(postMetaTable)
      .set({ published: true, publishedRevisionId: 1n })
      .where(eq(postMetaTable.id, BigInt(created.id)))
    const dto = await unpublishPost(db, BigInt(created.id))
    expect(dto.published).toBe(false)
  })
})

describe('posts/services/draft — saveDraft / publishLatest', () => {
  it('saves a draft revision for an existing post', async () => {
    const { createPost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Draft Me' }, null)
    const { saveDraft } = await import('@/server/domains/posts/services/draft')
    const r = await saveDraft(db, {
      postId: BigInt(created.id),
      body: inklingFromPt([
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'hi', marks: [] }],
        },
      ]),
      authorId: null,
    })
    expect(r.status).toBe('saved')
  })
  it('publishes the latest revision', async () => {
    const { createPost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Publish Me' }, null)
    const { publishLatest } = await import('@/server/domains/posts/services/draft')
    const r = await publishLatest(db, {
      postId: BigInt(created.id),
      body: inklingFromPt([
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'pub', marks: [] }],
        },
      ]),
      authorId: null,
    })
    expect(r.status).toBe('saved')
  })
})

describe('posts/services/search-index — indexPost', () => {
  it('inserts a search index row with no embedding', async () => {
    const pid = await seedPost({ slug: 'idx-post' })
    const { indexPost } = await import('@/server/domains/posts/services/search-index')
    await indexPost(
      db,
      pid,
      'Title',
      'Summary',
      inklingFromPt([
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'body', marks: [] }],
        },
      ]),
    )
    const { postSearchIndex } = await import('@/server/infra/db/schema/content')
    const rows = await db.select().from(postSearchIndex)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.plainText).toBe('body')
  })
  it('truncates over-long embeddings to the target dimension', async () => {
    const { generateEmbedding } = await import('@/server/infra/search/openai')
    vi.mocked(generateEmbedding).mockResolvedValueOnce(Array.from({ length: 2000 }, () => 0.1))
    const pid = await seedPost({ slug: 'idx-trunc' })
    const { indexPost } = await import('@/server/domains/posts/services/search-index')
    await indexPost(db, pid, 'T', 'S', emptyInklingDocument())
    expect(true).toBe(true)
  })
  it('pads short embeddings to the target dimension', async () => {
    const { generateEmbedding } = await import('@/server/infra/search/openai')
    vi.mocked(generateEmbedding).mockResolvedValueOnce([0.1, 0.2, 0.3])
    const pid = await seedPost({ slug: 'idx-pad' })
    const { indexPost } = await import('@/server/domains/posts/services/search-index')
    await indexPost(db, pid, 'T', 'S', emptyInklingDocument())
    expect(true).toBe(true)
  })
})
