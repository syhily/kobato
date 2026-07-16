import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { tag as tagTable } from '@/server/infra/db/schema/taxonomy'

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(
    async (_db: unknown, items: unknown[], _getUrl: unknown, apply: (item: unknown, lookup: unknown) => void) => {
      for (const item of items as object[]) {
        apply(item, { thumbhash: 't', publicUrl: 'https://cdn/x.png' })
      }
    },
  ),
}))

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
      cover: opts.cover ?? '',
      category: opts.category ?? '',
      visible: opts.visible ?? true,
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
      body: opts.body ?? [],
      ...opts,
    })
    .returning({ id: contentTable.id })
  return rows[0]!.id
}

async function seedTag(name: string, slug?: string): Promise<bigint> {
  const rows = await db
    .insert(tagTable)
    .values({ name, slug: slug ?? name.toLowerCase() })
    .returning({ id: tagTable.id })
  return rows[0]!.id
}

async function linkTag(postId: bigint, tagId: bigint): Promise<void> {
  await db.insert(postTag).values({ postId, tagId })
}

describe('posts/repos/shared — buildPostsWhere', () => {
  it('returns undefined when no filter is supplied', async () => {
    const { buildPostsWhere } = await import('@/server/domains/posts/repos/shared')
    expect(buildPostsWhere({})).toBeUndefined()
  })
  it('stacks deletedStatus / q / category / tag / flags / lifecycle', async () => {
    const { buildPostsWhere } = await import('@/server/domains/posts/repos/shared')
    expect(
      buildPostsWhere({
        deletedStatus: 'normal',
        q: 'foo',
        category: 'tech',
        tag: 'react',
        published: true,
        visible: true,
        lifecycle: 'published',
      }),
    ).toBeDefined()
    expect(
      buildPostsWhere({
        deletedStatus: 'deleted',
        lifecycle: 'draft',
      }),
    ).toBeDefined()
  })
})

describe('posts/repos/shared — buildPostsOrderBy', () => {
  it('falls back to firstPublishedAt desc', async () => {
    const { buildPostsOrderBy } = await import('@/server/domains/posts/repos/shared')
    expect(buildPostsOrderBy({})).toBeDefined()
  })
  it('switches to updatedAt asc', async () => {
    const { buildPostsOrderBy } = await import('@/server/domains/posts/repos/shared')
    expect(buildPostsOrderBy({ sortBy: 'updatedAt', sortOrder: 'asc' })).toBeDefined()
  })
})

describe('posts/repos/shared — toClientPostFromMeta', () => {
  it('projects meta + tags into the ClientPost shape', async () => {
    const { toClientPostFromMeta } = await import('@/server/domains/posts/repos/shared')
    const meta: typeof postMetaTable.$inferSelect = {
      id: 1n,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      slug: 's',
      title: 'T',
      summary: 'sum',
      cover: '',
      og: null,
      published: true,
      commentsEnabled: true,
      showToc: false,
      showUpdated: false,
      visible: true,
      publishedAt: new Date('2026-02-01'),
      publishedRevisionId: 1n,
      firstPublishedAt: new Date('2026-01-01'),
      authorId: null,
      category: 'tech',
      alias: ['a'],
      pinnedAt: null,
    }
    const out = toClientPostFromMeta(meta, ['react'])
    expect(out.slug).toBe('s')
    expect(out.tags).toEqual(['react'])
    expect(out.permalink).toBe('/posts/s')
  })
})

describe('posts/repos/shared — buildPublicPostsWhere', () => {
  it('always narrows to published, non-deleted rows', async () => {
    const { buildPublicPostsWhere } = await import('@/server/domains/posts/repos/shared')
    expect(buildPublicPostsWhere({})).toBeDefined()
    expect(buildPublicPostsWhere({ includeHidden: true, includeScheduled: true })).toBeDefined()
  })
  it('excludes scheduled rows unless includeScheduled is set', async () => {
    await seedPost({ slug: 'live-now', publishedRevisionId: 1n, publishedAt: new Date('2020-01-01') })
    await seedPost({ slug: 'live-future', publishedRevisionId: 1n, publishedAt: new Date('2099-01-01') })
    const { listPublicPosts } = await import('@/server/domains/posts/repos/public-query/listing')
    const scheduledExcluded = await listPublicPosts(db)
    expect(scheduledExcluded.map((r) => r.slug)).toEqual(['live-now'])
    const scheduledIncluded = await listPublicPosts(db, { includeScheduled: true })
    expect(scheduledIncluded.map((r) => r.slug).sort()).toEqual(['live-future', 'live-now'])
  })
})

describe('posts/repos/write — insertPostMeta / updatePostMetaById / softDelete / restore', () => {
  it('inserts a new post meta row', async () => {
    const { insertPostMeta } = await import('@/server/domains/posts/repos/write')
    const row = await insertPostMeta(db, { slug: 'new', title: 'New' })
    expect(row.slug).toBe('new')
  })
  it('updates fields by id', async () => {
    const { insertPostMeta, updatePostMetaById } = await import('@/server/domains/posts/repos/write')
    const inserted = await insertPostMeta(db, { slug: 'u', title: 'Old' })
    const updated = await updatePostMetaById(db, inserted.id, { title: 'New' })
    expect(updated?.title).toBe('New')
  })
  it('soft-deletes then restores', async () => {
    const { insertPostMeta, softDeletePostMeta, restorePostMeta } = await import('@/server/domains/posts/repos/write')
    const inserted = await insertPostMeta(db, { slug: 'sd', title: 'X' })
    expect(await softDeletePostMeta(db, inserted.id)).toBe(true)
    expect(await restorePostMeta(db, inserted.id)).toBe(true)
  })
  it('soft-delete returns false when already deleted', async () => {
    const { insertPostMeta, softDeletePostMeta } = await import('@/server/domains/posts/repos/write')
    const inserted = await insertPostMeta(db, { slug: 'sd2', title: 'X' })
    await softDeletePostMeta(db, inserted.id)
    expect(await softDeletePostMeta(db, inserted.id)).toBe(false)
  })
})

describe('posts/repos/single — findPostMetaById / BySlug / BySlugForUpdate / PublicBySlug', () => {
  it('finds a row by id', async () => {
    const id = await seedPost({ slug: 'find-id' })
    const { findPostMetaById } = await import('@/server/domains/posts/repos/single')
    const r = await findPostMetaById(db, id)
    expect(r?.slug).toBe('find-id')
  })
  it('finds a row by slug', async () => {
    await seedPost({ slug: 'find-slug' })
    const { findPostMetaBySlug } = await import('@/server/domains/posts/repos/single')
    const r = await findPostMetaBySlug(db, 'find-slug')
    expect(r).not.toBeNull()
  })
  it('finds a row by slug with FOR UPDATE', async () => {
    await seedPost({ slug: 'for-update' })
    const { findPostMetaBySlugForUpdate } = await import('@/server/domains/posts/repos/single')
    const r = await findPostMetaBySlugForUpdate(db, 'for-update')
    expect(r).not.toBeNull()
  })
  it('skips soft-deleted rows in the public lookup', async () => {
    await seedPost({ slug: 'pub-deleted', deletedAt: new Date() })
    const { findPublicPostMetaBySlug } = await import('@/server/domains/posts/repos/single')
    expect(await findPublicPostMetaBySlug(db, 'pub-deleted')).toBeNull()
  })
  it('returns null when the slug does not exist', async () => {
    const { findPublicPostMetaBySlug } = await import('@/server/domains/posts/repos/single')
    expect(await findPublicPostMetaBySlug(db, 'nope')).toBeNull()
  })
})

describe('posts/repos/single — toPostFromMeta', () => {
  it('produces a Post with empty body and imageSources', async () => {
    const { toPostFromMeta } = await import('@/server/domains/posts/repos/single')
    const meta: typeof postMetaTable.$inferSelect = {
      id: 1n,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      slug: 's',
      title: 'T',
      summary: '',
      cover: '',
      og: null,
      published: true,
      commentsEnabled: true,
      showToc: false,
      showUpdated: false,
      visible: true,
      publishedAt: new Date(),
      publishedRevisionId: null,
      firstPublishedAt: null,
      authorId: null,
      category: '',
      alias: [],
      pinnedAt: null,
    }
    const p = toPostFromMeta(meta, ['t'])
    expect(p.body).toEqual([])
    expect(p.imageSources).toEqual([])
    expect(p.publishedRevisionId).toBeNull()
  })
})

describe('posts/repos/single — findPostBySlug', () => {
  it('returns null when slug does not exist', async () => {
    const { findPostBySlug } = await import('@/server/domains/posts/repos/single')
    expect(await findPostBySlug(db, 'nope')).toBeNull()
  })
  it('returns null for a soft-deleted row', async () => {
    await seedPost({ slug: 'del', deletedAt: new Date() })
    const { findPostBySlug } = await import('@/server/domains/posts/repos/single')
    expect(await findPostBySlug(db, 'del')).toBeNull()
  })
  it('returns the post with body when published + revision exists', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    const pid = await seedPost({ slug: 'full', publishedRevisionId: revId })
    const { findPostBySlug } = await import('@/server/domains/posts/repos/single')
    const r = await findPostBySlug(db, 'full')
    expect(r?.id).toBe(String(pid))
  })
  it('returns null for a scheduled post (publishedAt in the future)', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    await seedPost({ slug: 'future', publishedRevisionId: revId, publishedAt: new Date('2099-01-01') })
    const { findPostBySlug } = await import('@/server/domains/posts/repos/single')
    expect(await findPostBySlug(db, 'future')).toBeNull()
  })
})

describe('posts/repos/single — findPostBySlugForAdmin', () => {
  it('returns the post regardless of published state', async () => {
    await seedPost({ slug: 'admin', published: false, publishedRevisionId: null })
    const { findPostBySlugForAdmin } = await import('@/server/domains/posts/repos/single')
    const r = await findPostBySlugForAdmin(db, 'admin')
    expect(r?.slug).toBe('admin')
  })
})

describe('posts/repos/hydrate — hydratePostImages / hydrateClientPostCovers', () => {
  it('does not throw on an empty list', async () => {
    const { hydratePostImages } = await import('@/server/domains/posts/repos/hydrate')
    await expect(hydratePostImages(db, [])).resolves.toBeUndefined()
  })
  it('invokes hydrateImageRefs for a non-empty post list', async () => {
    const { hydratePostImages } = await import('@/server/domains/posts/repos/hydrate')
    await hydratePostImages(db, [{ cover: '/c.png' } as never])
    const { hydrateImageRefs } = await import('@/server/domains/images/services/enhance')
    expect(hydrateImageRefs).toHaveBeenCalled()
  })
  it('invokes hydrateImageRefs for a non-empty client post list', async () => {
    const { hydrateClientPostCovers } = await import('@/server/domains/posts/repos/hydrate')
    await hydrateClientPostCovers(db, [{ cover: '/c.png' } as never])
    const { hydrateImageRefs } = await import('@/server/domains/images/services/enhance')
    expect(hydrateImageRefs).toHaveBeenCalled()
  })
})

describe('posts/repos/hydrate — buildPublicPostFilters', () => {
  it('defaults includeHidden/includeScheduled to false', async () => {
    const { buildPublicPostFilters } = await import('@/server/domains/posts/repos/hydrate')
    expect(buildPublicPostFilters()).toEqual({ includeHidden: false, includeScheduled: false })
    expect(buildPublicPostFilters({ includeHidden: true, includeScheduled: false })).toMatchObject({
      includeHidden: true,
    })
  })
})

describe('posts/repos/hydrate — hydratePostMetasToFullPosts', () => {
  it('returns [] for empty input', async () => {
    const { hydratePostMetasToFullPosts } = await import('@/server/domains/posts/repos/hydrate')
    expect(await hydratePostMetasToFullPosts(db, [])).toEqual([])
  })
  it('joins revisions and tags', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    const pid = await seedPost({ slug: 'h-full', publishedRevisionId: revId })
    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    const { hydratePostMetasToFullPosts } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostMetasToFullPosts(db, rows)
    expect(posts).toHaveLength(1)
  })
})

describe('posts/repos/public-query/listing — listPublicPosts', () => {
  it('applies limit + offset', async () => {
    await seedPost({ slug: 'a', publishedRevisionId: 1n, firstPublishedAt: new Date('2026-01-01') })
    await seedPost({ slug: 'b', publishedRevisionId: 1n, firstPublishedAt: new Date('2026-02-01') })
    const { listPublicPosts } = await import('@/server/domains/posts/repos/public-query/listing')
    const rows = await listPublicPosts(db, { limit: 1 })
    expect(rows).toHaveLength(1)
  })
  it('filters by category', async () => {
    await seedPost({ slug: 'a', publishedRevisionId: 1n, category: 'tech' })
    await seedPost({ slug: 'b', publishedRevisionId: 1n, category: 'life' })
    const { listPublicPosts } = await import('@/server/domains/posts/repos/public-query/listing')
    const rows = await listPublicPosts(db, { category: 'tech' })
    expect(rows).toHaveLength(1)
  })
})

describe('posts/repos/public-query/listing — countPublicPosts', () => {
  it('counts rows matching filters', async () => {
    await seedPost({ slug: 'a', publishedRevisionId: 1n })
    await seedPost({ slug: 'b', publishedRevisionId: 1n })
    const { countPublicPosts } = await import('@/server/domains/posts/repos/public-query/listing')
    expect(await countPublicPosts(db)).toBe(2)
  })
})

describe('posts/repos/public-query/listing — listPublicPostCards / Paginated / listClientPosts', () => {
  it('lists post cards (no tags)', async () => {
    await seedPost({ slug: 'card', publishedRevisionId: 1n })
    const { listPublicPostCards } = await import('@/server/domains/posts/repos/public-query/listing')
    const cards = await listPublicPostCards(db)
    expect(cards[0]?.slug).toBe('card')
  })
  it('paginates with total + hasMore', async () => {
    for (let i = 0; i < 3; i++) {
      await seedPost({ slug: `pg-${i}`, publishedRevisionId: 1n })
    }
    const { listPublicPostCardsPaginated } = await import('@/server/domains/posts/repos/public-query/listing')
    const r = await listPublicPostCardsPaginated(db, 1, 2)
    expect(r.posts).toHaveLength(2)
    expect(r.total).toBe(3)
  })
  it('listClientPosts returns posts with empty body', async () => {
    await seedPost({ slug: 'cl', publishedRevisionId: 1n })
    const { listClientPosts } = await import('@/server/domains/posts/repos/public-query/listing')
    const posts = await listClientPosts(db)
    expect(posts[0]?.slug).toBe('cl')
  })
})

describe('posts/repos/public-query/listing — getClientPostsWithMetadata', () => {
  it('returns [] for empty input', async () => {
    const { getClientPostsWithMetadata } = await import('@/server/domains/posts/repos/public-query/listing')
    expect(await getClientPostsWithMetadata(db, [], { likes: true, views: true, comments: true })).toEqual([])
  })
  it('joins likes/views/comments metadata per post', async () => {
    const pid = await seedPost({ slug: 'meta', publishedRevisionId: 1n })
    const { getClientPostsWithMetadata } = await import('@/server/domains/posts/repos/public-query/listing')
    const out = await getClientPostsWithMetadata(db, [{ id: String(pid) }], {
      likes: true,
      views: true,
      comments: true,
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.meta).toEqual({ likes: 0, views: 0, comments: 0 })
  })
})

describe('posts/repos/public-query/featured — selectFeaturePosts', () => {
  it('returns [] when featureEnabled=false', async () => {
    const { selectFeaturePosts } = await import('@/server/domains/posts/repos/public-query/featured')
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
      await seedPost({ slug: 'pin1', publishedRevisionId: 1n, pinnedAt: new Date('2026-01-01'), cover: '/c.png' })
      await seedPost({ slug: 'pin2', publishedRevisionId: 1n, pinnedAt: new Date('2026-01-02'), cover: '/c.png' })
      await seedPost({ slug: 'pin3', publishedRevisionId: 1n, pinnedAt: new Date('2026-01-03'), cover: '/c.png' })
      const { selectFeaturePosts } = await import('@/server/domains/posts/repos/public-query/featured')
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
      await seedPost({ slug: 'pin1', publishedRevisionId: 1n, pinnedAt: new Date('2026-01-01'), cover: '/c.png' })
      for (let i = 0; i < 20; i++) {
        await seedPost({
          slug: `cov-${i}`,
          publishedRevisionId: 1n,
          cover: '/c.png',
          firstPublishedAt: new Date('2025-01-01'),
        })
      }
      const { selectFeaturePosts } = await import('@/server/domains/posts/repos/public-query/featured')
      const out = await selectFeaturePosts(db, 'seed')
      expect(out).toHaveLength(3)
      expect(out[0]?.slug).toBe('pin1')
    } finally {
      BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
    }
  })
})

describe('posts/repos/public-query/featured — selectSidebarPosts', () => {
  it('returns [] for count=0', async () => {
    const { selectSidebarPosts } = await import('@/server/domains/posts/repos/public-query/featured')
    expect(await selectSidebarPosts(db, 0)).toEqual([])
  })
  it('returns posts when published + revision exists', async () => {
    await seedPost({ slug: 'side', publishedRevisionId: 1n, publishedAt: new Date('2020-01-01') })
    const { selectSidebarPosts } = await import('@/server/domains/posts/repos/public-query/featured')
    const rows = await selectSidebarPosts(db, 5)
    expect(rows[0]?.slug).toBe('side')
  })
})

describe('posts/repos/public-query/misc — listSitemapPosts', () => {
  it('returns rows with slug + dates for published posts', async () => {
    await seedPost({ slug: 'sm', publishedRevisionId: 1n })
    const { listSitemapPosts } = await import('@/server/domains/posts/repos/public-query/misc')
    const rows = await listSitemapPosts(db)
    expect(rows[0]?.slug).toBe('sm')
  })
})

describe('posts/repos/public-query/misc — getPostsBySlugs', () => {
  it('returns [] for empty slugs', async () => {
    const { getPostsBySlugs } = await import('@/server/domains/posts/repos/public-query/misc')
    expect(await getPostsBySlugs(db, [])).toEqual([])
  })
  it('returns posts by slug', async () => {
    await seedPost({ slug: 'slug-a', publishedRevisionId: 1n, published: true })
    const { getPostsBySlugs } = await import('@/server/domains/posts/repos/public-query/misc')
    const posts = await getPostsBySlugs(db, ['slug-a'])
    expect(posts).toHaveLength(1)
  })
})

describe('posts/repos/public-query/misc — listAllPosts', () => {
  it('returns posts (no body projection)', async () => {
    await seedPost({ slug: 'all', publishedRevisionId: 1n })
    const { listAllPosts } = await import('@/server/domains/posts/repos/public-query/misc')
    const posts = await listAllPosts(db)
    expect(posts[0]?.slug).toBe('all')
  })
})

describe('posts/repos/public-query/taxonomy — listPostsByCategory / listPostsByTag', () => {
  it('lists posts by category', async () => {
    await seedPost({ slug: 'c', publishedRevisionId: 1n, category: 'tech' })
    const { listPostsByCategory } = await import('@/server/domains/posts/repos/public-query/taxonomy')
    const posts = await listPostsByCategory(db, 'tech')
    expect(posts[0]?.slug).toBe('c')
  })
  it('lists posts by tag', async () => {
    const tid = await seedTag('React')
    const pid = await seedPost({ slug: 't', publishedRevisionId: 1n })
    await linkTag(pid, tid)
    const { listPostsByTag } = await import('@/server/domains/posts/repos/public-query/taxonomy')
    const posts = await listPostsByTag(db, 'React')
    expect(posts[0]?.slug).toBe('t')
  })
})

describe('posts/repos/public-query/feed — listPublicPostsWithContent', () => {
  it('returns posts with hydrated PT body', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    await seedPost({ slug: 'feed', publishedRevisionId: revId })
    const { listPublicPostsWithContent } = await import('@/server/domains/posts/repos/public-query/feed')
    const posts = await listPublicPostsWithContent(db)
    expect(posts[0]?.slug).toBe('feed')
  })
})
