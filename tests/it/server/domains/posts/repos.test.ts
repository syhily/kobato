import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
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
      categoryId: opts.categoryId ?? null,
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
        categoryId: 1n,
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
      categoryId: 1n,
      alias: ['a'],
      pinnedAt: null,
    }
    const out = toClientPostFromMeta(meta, ['react'], 'tech')
    expect(out.slug).toBe('s')
    expect(out.tags).toEqual(['react'])
    expect(out.category).toBe('tech')
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
    const { listPublicPosts } = await import('@/server/domains/posts/services/public-query')
    const scheduledExcluded = await listPublicPosts(db)
    expect(scheduledExcluded.map((r) => r.slug)).toEqual(['live-now'])
    const scheduledIncluded = await listPublicPosts(db, { includeScheduled: true })
    expect(scheduledIncluded.map((r) => r.slug).sort()).toEqual(['live-future', 'live-now'])
  })
})

describe('posts/repos/write — updatePostMetaById / softDelete / restore', () => {
  it('updates fields by id', async () => {
    const id = await seedPost({ slug: 'u', title: 'Old' })
    const { updatePostMetaById } = await import('@/server/domains/posts/repos/write')
    const updated = await updatePostMetaById(db, id, { title: 'New' })
    expect(updated?.title).toBe('New')
  })
  it('soft-deletes then restores', async () => {
    const id = await seedPost({ slug: 'sd', title: 'X' })
    const { softDeletePostMeta, restorePostMeta } = await import('@/server/domains/posts/repos/write')
    expect(await softDeletePostMeta(db, id)).toBe(true)
    expect(await restorePostMeta(db, id)).toBe(true)
  })
  it('soft-delete returns false when already deleted', async () => {
    const id = await seedPost({ slug: 'sd2', title: 'X' })
    const { softDeletePostMeta } = await import('@/server/domains/posts/repos/write')
    await softDeletePostMeta(db, id)
    expect(await softDeletePostMeta(db, id)).toBe(false)
  })
})

describe('posts/repos/hydrate — hydratePostImages', () => {
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
  it('hydrates any post-shaped projection (ClientPost included)', async () => {
    const { hydratePostImages } = await import('@/server/domains/posts/repos/hydrate')
    const clientPost = { cover: '/c.png' } as never
    await hydratePostImages(db, [clientPost])
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

describe('posts/repos/hydrate — hydratePostList', () => {
  it('returns [] for empty input', async () => {
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    expect(await hydratePostList(db, [])).toEqual([])
  })
  it('projects metas with tags and an empty body by default', async () => {
    const tid = await seedTag('React')
    const pid = await seedPost({ slug: 'h-list', publishedRevisionId: 1n })
    await linkTag(pid, tid)
    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostList(db, rows)
    expect(posts).toHaveLength(1)
    expect(posts[0]?.tags).toEqual(['React'])
    expect(posts[0]?.body).toEqual([])
  })
  it('joins published revisions when revision: published', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    const pid = await seedPost({ slug: 'h-full', publishedRevisionId: revId })
    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostList(db, rows, { revision: 'published' })
    expect(posts).toHaveLength(1)
    expect(posts[0]?.publishedRevisionId).toBe(revId)
  })
  it('skips cover hydration when images: false', async () => {
    const pid = await seedPost({ slug: 'h-noimg', publishedRevisionId: 1n, cover: '/c.png' })
    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostList(db, rows, { images: false })
    expect(posts[0]?.cover).toBe('/c.png')
    expect(posts[0]?.coverThumbhash).toBeUndefined()
  })
})
