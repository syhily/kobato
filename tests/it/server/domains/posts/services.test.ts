import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

async function seedPost(opts: Partial<typeof postMetaTable.$inferInsert> = {}): Promise<number> {
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

async function seedContent(opts: Partial<typeof contentTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(contentTable)
    .values({
      type: opts.type ?? 'post',
      ownerId: opts.ownerId ?? 1,
      revisionNo: opts.revisionNo ?? 1,
      status: opts.status ?? 'published',
      body: opts.body ?? [],
      ...opts,
    })
    .returning({ id: contentTable.id })
  return rows[0]!.id
}

async function seedCategory(name: string, slug?: string): Promise<number> {
  const rows = await db
    .insert(categoryTable)
    .values({ name, slug: slug ?? name.toLowerCase(), cover: '' })
    .returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function seedTag(name: string, slug?: string): Promise<number> {
  const rows = await db
    .insert(tagTable)
    .values({ name, slug: slug ?? name.toLowerCase() })
    .returning({ id: tagTable.id })
  return rows[0]!.id
}

async function linkTag(postId: number, tagId: number): Promise<void> {
  await db.insert(postTag).values({ postId, tagId })
}

describe('posts/services/admin-query — listPostsForAdmin', () => {
  it('returns an empty result when there are no posts', async () => {
    const { listPostsForAdmin } = await import('@/server/domains/posts/services/admin-query')
    const r = await listPostsForAdmin(db, {})
    expect(r.posts).toEqual([])
    expect(r.total).toBe(0)
  })
  it('returns posts + total', async () => {
    await seedPost({ slug: 'a', publishedRevisionId: 1 })
    await seedPost({ slug: 'b', publishedRevisionId: 1 })
    const { listPostsForAdmin } = await import('@/server/domains/posts/services/admin-query')
    const r = await listPostsForAdmin(db, { offset: 0, limit: 10 })
    expect(r.total).toBe(2)
    expect(r.posts).toHaveLength(2)
  })
  it('filters by lifecycle=draft', async () => {
    await seedPost({ slug: 'pub', published: true, publishedRevisionId: 1 })
    await seedPost({ slug: 'drf', published: false })
    const { listPostsForAdmin } = await import('@/server/domains/posts/services/admin-query')
    const r = await listPostsForAdmin(db, { lifecycle: 'draft' })
    expect(r.total).toBe(1)
  })
})

describe('posts/services/admin-query — getPostDetailForAdmin', () => {
  it('throws NOT_FOUND when the post does not exist', async () => {
    const { getPostDetailForAdmin } = await import('@/server/domains/posts/services/admin-query')
    await expect(getPostDetailForAdmin(db, 9999)).rejects.toMatchObject({ code: 'NOT_FOUND' })
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

describe('content/lifecycle (post adapter) — loadDraftPreviewBySlug', () => {
  it('returns null when the slug does not exist', async () => {
    const { loadDraftPreviewBySlug } = await import('@/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@/server/domains/posts/services/lifecycle-adapter')
    expect(await loadDraftPreviewBySlug(db, postLifecycleAdapter, 'nope')).toBeNull()
  })
  it('returns the published revision when no draft exists', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    await seedPost({ slug: 'prev', publishedRevisionId: revId })
    const { loadDraftPreviewBySlug } = await import('@/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@/server/domains/posts/services/lifecycle-adapter')
    const r = await loadDraftPreviewBySlug(db, postLifecycleAdapter, 'prev')
    expect(r?.preview.slug).toBe('prev')
    expect(r?.hasNewerDraft).toBe(false)
  })
  it('returns the draft when one exists', async () => {
    const pid = await seedPost({ slug: 'dr', publishedRevisionId: null })
    await seedContent({ type: 'post', ownerId: pid, revisionNo: 1, status: 'draft' })
    const { loadDraftPreviewBySlug } = await import('@/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@/server/domains/posts/services/lifecycle-adapter')
    const r = await loadDraftPreviewBySlug(db, postLifecycleAdapter, 'dr')
    expect(r?.hasNewerDraft).toBe(true)
  })
})

describe('posts/services/search-index — removePostIndex', () => {
  it('deletes the search index row without error', async () => {
    const { removePostIndex } = await import('@/server/domains/posts/services/search-index')
    expect(() => removePostIndex(db, 9999)).not.toThrow()
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
      body: [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [{ _type: 'span', _key: 's1', text: 'hi', marks: [] }],
        },
      ],
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
      body: [],
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
    const dto = await updatePostMeta(db, { id: Number(created.id), title: 'New Title' })
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
    const r = await deletePost(db, Number(created.id))
    expect(r.deleted).toBe(true)
  })
  it('restores a soft-deleted post', async () => {
    const { createPost, deletePost, restorePost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'To Restore' }, null)
    await deletePost(db, Number(created.id))
    const r = await restorePost(db, Number(created.id))
    expect(r.restored).toBe(true)
  })
  it('unpublishes a published post', async () => {
    const { createPost, unpublishPost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'To Unpublish' }, null)
    await db
      .update(postMetaTable)
      .set({ published: true, publishedRevisionId: 1 })
      .where(eq(postMetaTable.id, Number(created.id)))
    const dto = await unpublishPost(db, Number(created.id))
    expect(dto.published).toBe(false)
  })
})

describe('content/lifecycle (post adapter) — saveBody draft / publish', () => {
  it('saves a draft revision for an existing post', async () => {
    const { createPost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Draft Me' }, null)
    const { saveBody } = await import('@/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@/server/domains/posts/services/lifecycle-adapter')
    const r = await saveBody(
      db,
      postLifecycleAdapter,
      {
        entityId: Number(created.id),
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'hi', marks: [] }],
          },
        ],
        authorId: null,
      },
      'draft',
    )
    expect(r.status).toBe('saved')
  })
  it('publishes the latest revision', async () => {
    const { createPost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Publish Me' }, null)
    const { saveBody } = await import('@/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@/server/domains/posts/services/lifecycle-adapter')
    const r = await saveBody(
      db,
      postLifecycleAdapter,
      {
        entityId: Number(created.id),
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'pub', marks: [] }],
          },
        ],
        authorId: null,
      },
      'publish',
    )
    expect(r.status).toBe('saved')
  })
  it('audits a force save against the latest revision of any status (not just drafts)', async () => {
    const { createPost } = await import('@/server/domains/posts/services/mutate')
    const created = await createPost(db, { title: 'Force Audit' }, null)
    const pid = Number(created.id)
    // Only a published revision exists: the old posts track looked up the
    // latest *draft* here and skipped the audit; the merged pipeline reads
    // the latest revision regardless of status.
    await seedContent({
      type: 'post',
      ownerId: pid,
      revisionNo: 1,
      status: 'published',
      clientRevisionToken: '00000000-0000-4000-8000-000000000042',
    })
    const { saveBody } = await import('@/server/domains/content/lifecycle')
    const { postLifecycleAdapter } = await import('@/server/domains/posts/services/lifecycle-adapter')
    const spy = vi.spyOn(postLifecycleAdapter, 'recordForceOverwrite')
    try {
      const r = await saveBody(
        db,
        postLifecycleAdapter,
        {
          entityId: pid,
          body: [
            {
              _type: 'block',
              _key: 'b1',
              style: 'normal',
              children: [{ _type: 'span', _key: 's1', text: 'force', marks: [] }],
            },
          ],
          authorId: null,
          expectedClientRevisionToken: 'stale-token',
          force: true,
        },
        'draft',
      )
      expect(r.status).toBe('saved')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0].overwritten.clientRevisionToken).toBe('00000000-0000-4000-8000-000000000042')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('posts/services/search-index — indexPost', () => {
  it('inserts a search index row with no embedding', async () => {
    const pid = await seedPost({ slug: 'idx-post' })
    const { indexPost } = await import('@/server/domains/posts/services/search-index')
    await indexPost(db, pid, 'Title', 'Summary', [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'body', marks: [] }],
      },
    ])
    const { postSearchIndex } = await import('@/server/infra/db/schema/content')
    const rows = await db.select().from(postSearchIndex)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.plainText).toBe('body')
  })
})

describe('posts/services/single — findPostMetaById / BySlug / BySlugForUpdate / PublicBySlug', () => {
  it('finds a row by id', async () => {
    const id = await seedPost({ slug: 'find-id' })
    const { findPostMetaById } = await import('@/server/domains/posts/services/single')
    const r = await findPostMetaById(db, id)
    expect(r?.slug).toBe('find-id')
  })
  it('finds a row by slug', async () => {
    await seedPost({ slug: 'find-slug' })
    const { findPostMetaBySlug } = await import('@/server/domains/posts/services/single')
    const r = await findPostMetaBySlug(db, 'find-slug')
    expect(r).not.toBeNull()
  })
  it('finds a row by slug with FOR UPDATE', async () => {
    await seedPost({ slug: 'for-update' })
    const { findPostMetaBySlugForUpdate } = await import('@/server/domains/posts/services/single')
    const r = await findPostMetaBySlugForUpdate(db, 'for-update')
    expect(r).not.toBeNull()
  })
  it('skips soft-deleted rows in the public lookup', async () => {
    await seedPost({ slug: 'pub-deleted', deletedAt: new Date() })
    const { findPublicPostMetaBySlug } = await import('@/server/domains/posts/services/single')
    expect(await findPublicPostMetaBySlug(db, 'pub-deleted')).toBeNull()
  })
  it('returns null when the slug does not exist', async () => {
    const { findPublicPostMetaBySlug } = await import('@/server/domains/posts/services/single')
    expect(await findPublicPostMetaBySlug(db, 'nope')).toBeNull()
  })
})

describe('posts/services/single — findPostBySlug', () => {
  it('returns null when slug does not exist', async () => {
    const { findPostBySlug } = await import('@/server/domains/posts/services/single')
    expect(await findPostBySlug(db, 'nope')).toBeNull()
  })
  it('returns null for a soft-deleted row', async () => {
    await seedPost({ slug: 'del', deletedAt: new Date() })
    const { findPostBySlug } = await import('@/server/domains/posts/services/single')
    expect(await findPostBySlug(db, 'del')).toBeNull()
  })
  it('returns the post with body when published + revision exists', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    const pid = await seedPost({ slug: 'full', publishedRevisionId: revId })
    const { findPostBySlug } = await import('@/server/domains/posts/services/single')
    const r = await findPostBySlug(db, 'full')
    expect(r?.id).toBe(String(pid))
  })
  it('returns null for a scheduled post (publishedAt in the future)', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    await seedPost({ slug: 'future', publishedRevisionId: revId, publishedAt: new Date('2099-01-01') })
    const { findPostBySlug } = await import('@/server/domains/posts/services/single')
    expect(await findPostBySlug(db, 'future')).toBeNull()
  })
})

describe('posts/services/single — findPostBySlugForAdmin', () => {
  it('returns the post regardless of published state', async () => {
    await seedPost({ slug: 'admin', published: false, publishedRevisionId: null })
    const { findPostBySlugForAdmin } = await import('@/server/domains/posts/services/single')
    const r = await findPostBySlugForAdmin(db, 'admin')
    expect(r?.slug).toBe('admin')
  })
})

describe('posts/services/public-query — listPublicPosts', () => {
  it('applies limit + offset', async () => {
    await seedPost({ slug: 'a', publishedRevisionId: 1, firstPublishedAt: new Date('2026-01-01') })
    await seedPost({ slug: 'b', publishedRevisionId: 1, firstPublishedAt: new Date('2026-02-01') })
    const { listPublicPosts } = await import('@/server/domains/posts/services/public-query')
    const rows = await listPublicPosts(db, { limit: 1 })
    expect(rows).toHaveLength(1)
  })
  it('filters by category', async () => {
    const techId = await seedCategory('tech')
    const lifeId = await seedCategory('life')
    await seedPost({ slug: 'a', publishedRevisionId: 1, categoryId: techId })
    await seedPost({ slug: 'b', publishedRevisionId: 1, categoryId: lifeId })
    const { listPublicPosts } = await import('@/server/domains/posts/services/public-query')
    const rows = await listPublicPosts(db, { categoryId: techId })
    expect(rows).toHaveLength(1)
  })
})

describe('posts/services/public-query — countPublicPosts', () => {
  it('counts rows matching filters', async () => {
    await seedPost({ slug: 'a', publishedRevisionId: 1 })
    await seedPost({ slug: 'b', publishedRevisionId: 1 })
    const { countPublicPosts } = await import('@/server/domains/posts/services/public-query')
    expect(await countPublicPosts(db)).toBe(2)
  })
})

describe('posts/services/public-query — listPublicPostCards / Paginated / listClientPosts', () => {
  it('lists post cards (no tags)', async () => {
    await seedPost({ slug: 'card', publishedRevisionId: 1 })
    const { listPublicPostCards } = await import('@/server/domains/posts/services/public-query')
    const cards = await listPublicPostCards(db)
    expect(cards[0]?.slug).toBe('card')
  })
  it('paginates post cards', async () => {
    for (let i = 0; i < 3; i++) {
      await seedPost({ slug: `pg-${i}`, publishedRevisionId: 1 })
    }
    const { listPublicPostCardsPaginated } = await import('@/server/domains/posts/services/public-query')
    const cards = await listPublicPostCardsPaginated(db, 1, 2)
    expect(cards).toHaveLength(2)
  })
  it('listClientPosts returns posts with empty body', async () => {
    await seedPost({ slug: 'cl', publishedRevisionId: 1 })
    const { listClientPosts } = await import('@/server/domains/posts/services/public-query')
    const posts = await listClientPosts(db)
    expect(posts[0]?.slug).toBe('cl')
  })
})

describe('posts/services/public-query — getClientPostsWithMetadata', () => {
  it('returns [] for empty input', async () => {
    const { getClientPostsWithMetadata } = await import('@/server/domains/posts/services/public-query')
    expect(await getClientPostsWithMetadata(db, [], { likes: true, views: true, comments: true })).toEqual([])
  })
  it('joins likes/views/comments metadata per post', async () => {
    const pid = await seedPost({ slug: 'meta', publishedRevisionId: 1 })
    const { getClientPostsWithMetadata } = await import('@/server/domains/posts/services/public-query')
    const out = await getClientPostsWithMetadata(db, [{ id: String(pid) }], {
      likes: true,
      views: true,
      comments: true,
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.meta).toEqual({ likes: 0, views: 0, comments: 0 })
  })
})

describe('posts/services/featured — selectFeaturePosts', () => {
  it('returns [] when featureEnabled=false', async () => {
    const { selectFeaturePosts } = await import('@/server/domains/posts/services/featured')
    const out = await selectFeaturePosts(db, 'seed')
    expect(out).toEqual([])
  })
  it('returns pinned posts first when featureEnabled=true', async () => {
    const { BLOG_SETTINGS_SNAPSHOT_SLOT } = await import('@/shared/config/snapshot')
    const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')
    const tweaked = {
      ...TEST_BLOG_SETTINGS_BUNDLE,
      content: {
        ...TEST_BLOG_SETTINGS_BUNDLE.content!,
        post: { ...TEST_BLOG_SETTINGS_BUNDLE.content!.post, featureEnabled: true },
      },
    }
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(tweaked)
    try {
      await seedPost({ slug: 'pin1', publishedRevisionId: 1, pinnedAt: new Date('2026-01-01'), cover: '/c.png' })
      await seedPost({ slug: 'pin2', publishedRevisionId: 1, pinnedAt: new Date('2026-01-02'), cover: '/c.png' })
      await seedPost({ slug: 'pin3', publishedRevisionId: 1, pinnedAt: new Date('2026-01-03'), cover: '/c.png' })
      const { selectFeaturePosts } = await import('@/server/domains/posts/services/featured')
      const out = await selectFeaturePosts(db, 'seed')
      expect(out).toHaveLength(3)
    } finally {
      BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    }
  })
  it('falls back to recent posts when fewer than 3 are pinned', async () => {
    const { BLOG_SETTINGS_SNAPSHOT_SLOT } = await import('@/shared/config/snapshot')
    const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')
    const tweaked = {
      ...TEST_BLOG_SETTINGS_BUNDLE,
      content: {
        ...TEST_BLOG_SETTINGS_BUNDLE.content!,
        post: { ...TEST_BLOG_SETTINGS_BUNDLE.content!.post, featureEnabled: true },
      },
    }
    BLOG_SETTINGS_SNAPSHOT_SLOT.write(tweaked)
    try {
      await seedPost({ slug: 'pin1', publishedRevisionId: 1, pinnedAt: new Date('2026-01-01'), cover: '/c.png' })
      for (let i = 0; i < 20; i++) {
        await seedPost({
          slug: `cov-${i}`,
          publishedRevisionId: 1,
          cover: '/c.png',
          firstPublishedAt: new Date('2025-01-01'),
        })
      }
      const { selectFeaturePosts } = await import('@/server/domains/posts/services/featured')
      const out = await selectFeaturePosts(db, 'seed')
      expect(out).toHaveLength(3)
      expect(out[0]?.slug).toBe('pin1')
    } finally {
      BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    }
  })
})

describe('posts/services/featured — selectSidebarPosts', () => {
  it('returns [] for count=0', async () => {
    const { selectSidebarPosts } = await import('@/server/domains/posts/services/featured')
    expect(await selectSidebarPosts(db, 0)).toEqual([])
  })
  it('returns posts when published + revision exists', async () => {
    await seedPost({ slug: 'side', publishedRevisionId: 1, publishedAt: new Date('2020-01-01') })
    const { selectSidebarPosts } = await import('@/server/domains/posts/services/featured')
    const rows = await selectSidebarPosts(db, 5)
    expect(rows[0]?.slug).toBe('side')
  })

  it('returns up to count distinct posts from the live set', async () => {
    await seedPost({ slug: 's1', publishedRevisionId: 1, publishedAt: new Date('2020-01-01') })
    await seedPost({ slug: 's2', publishedRevisionId: 2, publishedAt: new Date('2020-01-02') })
    await seedPost({ slug: 's3', publishedRevisionId: 3, publishedAt: new Date('2020-01-03') })
    const { selectSidebarPosts } = await import('@/server/domains/posts/services/featured')

    const two = await selectSidebarPosts(db, 2)
    expect(two).toHaveLength(2)
    expect(new Set(two.map((r) => r.slug)).size).toBe(2)
    for (const row of two) {
      expect(['s1', 's2', 's3']).toContain(row.slug)
    }

    // Asking for more than the table holds returns everything live.
    const all = await selectSidebarPosts(db, 10)
    expect(all).toHaveLength(3)
  })

  it('randomises the pick across calls (no seed degradation)', async () => {
    await seedPost({ slug: 'r1', publishedRevisionId: 1, publishedAt: new Date('2020-01-01') })
    await seedPost({ slug: 'r2', publishedRevisionId: 2, publishedAt: new Date('2020-01-02') })
    const { selectSidebarPosts } = await import('@/server/domains/posts/services/featured')

    const seen = new Set<string>()
    for (let i = 0; i < 30 && seen.size < 2; i++) {
      const [row] = await selectSidebarPosts(db, 1)
      if (row) {
        seen.add(row.slug)
      }
    }
    expect(seen).toEqual(new Set(['r1', 'r2']))
  })

  it('reads the post table a constant number of times regardless of count', async () => {
    // Regression: the old implementation fired one `LIMIT 1 OFFSET n`
    // query PER picked row — up to 100 parallel post-table reads per
    // sidebar render. The pick must be computed in JS and fetched in one
    // batched query.
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `q-${i}`, publishedRevisionId: i + 1, publishedAt: new Date('2020-01-01') })
    }
    const { drizzle } = await import('drizzle-orm/node-sqlite')
    const queries: string[] = []
    const counting = drizzle({
      client: getDatabaseHandle().client,
      logger: { logQuery: (query) => queries.push(query) },
    })
    const { selectSidebarPosts } = await import('@/server/domains/posts/services/featured')

    const rows = await selectSidebarPosts(counting, 5)

    expect(rows).toHaveLength(5)
    expect(new Set(rows.map((r) => r.slug)).size).toBe(5)
    // One id scan + one batched row fetch — hydration hits other tables.
    const postTableQueries = queries.filter((q) => q.includes('"post"'))
    expect(postTableQueries).toHaveLength(2)
  })
})

describe('posts/services/public-query — listSitemapPosts', () => {
  it('returns rows with slug + dates for published posts', async () => {
    await seedPost({ slug: 'sm', publishedRevisionId: 1 })
    const { listSitemapPosts } = await import('@/server/domains/posts/services/public-query')
    const rows = await listSitemapPosts(db)
    expect(rows[0]?.slug).toBe('sm')
  })
})

describe('posts/services/public-query — getPostsBySlugs', () => {
  it('returns [] for empty slugs', async () => {
    const { getPostsBySlugs } = await import('@/server/domains/posts/services/public-query')
    expect(await getPostsBySlugs(db, [])).toEqual([])
  })
  it('returns posts by slug', async () => {
    await seedPost({ slug: 'slug-a', publishedRevisionId: 1, published: true })
    const { getPostsBySlugs } = await import('@/server/domains/posts/services/public-query')
    const posts = await getPostsBySlugs(db, ['slug-a'])
    expect(posts).toHaveLength(1)
  })
})

describe('posts/services/public-query — listAllPosts', () => {
  it('returns posts (no body projection)', async () => {
    await seedPost({ slug: 'all', publishedRevisionId: 1 })
    const { listAllPosts } = await import('@/server/domains/posts/services/public-query')
    const posts = await listAllPosts(db)
    expect(posts[0]?.slug).toBe('all')
  })
})

describe('posts/services/taxonomy — listPostsByTaxonomy', () => {
  it('lists posts by category', async () => {
    const techId = await seedCategory('tech')
    await seedPost({ slug: 'c', publishedRevisionId: 1, categoryId: techId })
    const { listPostsByTaxonomy } = await import('@/server/domains/posts/services/taxonomy')
    const posts = await listPostsByTaxonomy(db, 'category', 'tech')
    expect(posts[0]?.slug).toBe('c')
  })
  it('lists posts by tag', async () => {
    const tid = await seedTag('React')
    const pid = await seedPost({ slug: 't', publishedRevisionId: 1 })
    await linkTag(pid, tid)
    const { listPostsByTaxonomy } = await import('@/server/domains/posts/services/taxonomy')
    const posts = await listPostsByTaxonomy(db, 'tag', 'React')
    expect(posts[0]?.slug).toBe('t')
  })
})

describe('posts/services/taxonomy — listPostTitlesByCategoryId / listPostTitlesByTaxonomy', () => {
  it('returns only titles, including hidden and scheduled posts', async () => {
    const techId = await seedCategory('tech')
    const lifeId = await seedCategory('life')
    await seedPost({ slug: 'vis', title: 'Visible', publishedRevisionId: 1, categoryId: techId })
    await seedPost({ slug: 'hid', title: 'Hidden', publishedRevisionId: 1, categoryId: techId, visible: false })
    await seedPost({
      slug: 'sch',
      title: 'Scheduled',
      publishedRevisionId: 1,
      categoryId: techId,
      publishedAt: new Date('2099-01-01'),
    })
    await seedPost({ slug: 'other', title: 'Other', publishedRevisionId: 1, categoryId: lifeId })
    const { listPostTitlesByCategoryId } = await import('@/server/domains/posts/services/taxonomy')
    const titles = await listPostTitlesByCategoryId(db, techId)
    expect(titles.sort()).toEqual(['Hidden', 'Scheduled', 'Visible'])
  })
  it('excludes drafts (no published revision) and matches tags by name', async () => {
    const tid = await seedTag('React')
    const livePid = await seedPost({ slug: 'live', title: 'Live', publishedRevisionId: 1 })
    const draftPid = await seedPost({ slug: 'draft', title: 'Draft', published: false, publishedRevisionId: null })
    await linkTag(livePid, tid)
    await linkTag(draftPid, tid)
    const { listPostTitlesByTaxonomy } = await import('@/server/domains/posts/services/taxonomy')
    expect(await listPostTitlesByTaxonomy(db, 'tag', 'React')).toEqual(['Live'])
  })
})

describe('posts/services/feed — listPublicPostsWithContent', () => {
  it('returns posts with hydrated PT body', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    await seedPost({ slug: 'feed', publishedRevisionId: revId })
    const { listPublicPostsWithContent } = await import('@/server/domains/posts/services/feed')
    const posts = await listPublicPostsWithContent(db)
    expect(posts[0]?.slug).toBe('feed')
  })
})
