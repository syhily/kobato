import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { image as imageTable } from '@/server/infra/db/schema/media'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
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
      cover: opts.cover ?? '',
      categoryId: opts.categoryId ?? null,
      visible: opts.visible ?? true,
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

async function seedTag(name: string, slug?: string): Promise<number> {
  const rows = await db
    .insert(tagTable)
    .values({ name, slug: slug ?? name.toLowerCase() })
    .returning({ id: tagTable.id })
  return rows[0]!.id
}

async function seedCategory(name: string, slug?: string): Promise<number> {
  const rows = await db
    .insert(categoryTable)
    .values({ name, slug: slug ?? name.toLowerCase(), cover: '' })
    .returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function linkTag(postId: number, tagId: number): Promise<void> {
  await db.insert(postTag).values({ postId, tagId })
}

async function seedImage(overrides: Partial<typeof imageTable.$inferInsert> = {}) {
  const rows = await db
    .insert(imageTable)
    .values({
      storagePath: 'images/cover.png',
      storageDriver: 's3',
      mimeType: 'image/png',
      width: 10,
      height: 20,
      byteSize: 1234,
      thumbhash: 't',
      ...overrides,
    })
    .returning()
  return rows[0]!
}

/** The CDN public URL the real hydrateImageRefs writes for a seeded row. */
function coverUrl(row: typeof imageTable.$inferSelect): string {
  return `https://assets.example.com/${row.storagePath}?v=${row.updatedAt.getTime()}`
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
        categoryId: 1,
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
      id: 1,
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
      webmentionsEnabled: true,
      showToc: false,
      showUpdated: false,
      visible: true,
      publishedAt: new Date('2026-02-01'),
      publishedRevisionId: 1,
      firstPublishedAt: new Date('2026-01-01'),
      authorId: null,
      categoryId: 1,
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
    await seedPost({ slug: 'live-now', publishedRevisionId: 1, publishedAt: new Date('2020-01-01') })
    await seedPost({ slug: 'live-future', publishedRevisionId: 1, publishedAt: new Date('2099-01-01') })
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
  it('rewrites a resolvable cover to its CDN public URL', async () => {
    const row = await seedImage()
    const { hydratePostImages } = await import('@/server/domains/posts/repos/hydrate')
    const item = { cover: '/images/cover.png' } as { cover: string; coverThumbhash?: string }
    await hydratePostImages(db, [item])
    expect(item.cover).toBe(coverUrl(row))
    expect(item.coverThumbhash).toBe('t')
  })
  it('hydrates any post-shaped projection (ClientPost included)', async () => {
    const row = await seedImage()
    const { hydratePostImages } = await import('@/server/domains/posts/repos/hydrate')
    const clientPost = { cover: '/images/cover.png' } as { cover: string; coverThumbhash?: string }
    await hydratePostImages(db, [clientPost])
    expect(clientPost.cover).toBe(coverUrl(row))
    expect(clientPost.coverThumbhash).toBe('t')
  })
  it('leaves an unresolvable cover untouched', async () => {
    const { hydratePostImages } = await import('@/server/domains/posts/repos/hydrate')
    const item = { cover: '/c.png' } as { cover: string; coverThumbhash?: string }
    await hydratePostImages(db, [item])
    expect(item.cover).toBe('/c.png')
    expect(item.coverThumbhash).toBeUndefined()
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
    const pid = await seedPost({ slug: 'h-list', publishedRevisionId: 1 })
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
    const pid = await seedPost({ slug: 'h-noimg', publishedRevisionId: 1, cover: '/c.png' })
    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostList(db, rows, { images: false })
    expect(posts[0]?.cover).toBe('/c.png')
    expect(posts[0]?.coverThumbhash).toBeUndefined()
  })
  it('hydrates covers to CDN URLs by default (revision: none)', async () => {
    const imageRow = await seedImage()
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    const pid = await seedPost({ slug: 'h-cover', publishedRevisionId: revId, cover: '/images/cover.png' })
    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostList(db, rows)
    // The real hydrateImageRefs rewrites cover/coverThumbhash from the
    // seeded image row.
    expect(posts[0]?.cover).toBe(coverUrl(imageRow))
    expect(posts[0]?.coverThumbhash).toBe('t')
    // revision defaults to 'none': no body join even though a published
    // revision exists.
    expect(posts[0]?.body).toEqual([])
    expect(posts[0]?.headings).toEqual([])
    expect(posts[0]?.imageSources).toEqual([])
    expect(posts[0]?.publishedRevisionId).toBe(revId)
  })
  it('resolves category names; null and dangling ids yield an empty string', async () => {
    const techId = await seedCategory('Tech')
    const ghostId = await seedCategory('Ghost')
    await seedPost({ slug: 'h-cat', categoryId: techId })
    await seedPost({ slug: 'h-cat-null', categoryId: null })
    await seedPost({ slug: 'h-cat-dangling', categoryId: ghostId })
    // Dangling FK: remove the category behind p3's back (FK checks off, as
    // legacy data would look after a pre-FK-era delete).
    db.run(sql`PRAGMA foreign_keys = OFF`)
    try {
      await db.delete(categoryTable).where(eq(categoryTable.id, ghostId))
    } finally {
      db.run(sql`PRAGMA foreign_keys = ON`)
    }
    const rows = await db.select().from(postMetaTable)
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostList(db, rows)
    const bySlug = new Map(posts.map((p) => [p.slug, p]))
    expect(bySlug.get('h-cat')?.category).toBe('Tech')
    expect(bySlug.get('h-cat-null')?.category).toBe('')
    expect(bySlug.get('h-cat-dangling')?.category).toBe('')
  })
  it('joins bodies/headings/imageSources from the published revision', async () => {
    const body = [
      { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'Hi' }] },
    ]
    const headings = [{ depth: 2, text: 'Hi', slug: 'hi' }]
    const revId = await seedContent({
      type: 'post',
      revisionNo: 1,
      status: 'published',
      body,
      headings,
      imageSources: ['images/x.jpg'],
    })
    await seedPost({ slug: 'h-rev', publishedRevisionId: revId })
    await seedPost({ slug: 'h-rev-none', publishedRevisionId: null })
    const rows = await db.select().from(postMetaTable)
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostList(db, rows, { revision: 'published' })
    const bySlug = new Map(posts.map((p) => [p.slug, p]))
    expect(bySlug.get('h-rev')?.body).toEqual(body)
    expect(bySlug.get('h-rev')?.headings).toEqual(headings)
    expect(bySlug.get('h-rev')?.imageSources).toEqual(['images/x.jpg'])
    // Meta without a published revision id still projects, with an empty body.
    expect(bySlug.get('h-rev-none')?.body).toEqual([])
  })
  it('joins revisions but skips covers with revision: published + images: false', async () => {
    const revId = await seedContent({ type: 'post', revisionNo: 1, status: 'published' })
    const pid = await seedPost({ slug: 'h-rev-noimg', publishedRevisionId: revId, cover: '/images/cover.png' })
    const rows = await db.select().from(postMetaTable).where(eq(postMetaTable.id, pid))
    const { hydratePostList } = await import('@/server/domains/posts/repos/hydrate')
    const posts = await hydratePostList(db, rows, { revision: 'published', images: false })
    expect(posts[0]?.cover).toBe('/images/cover.png')
    expect(posts[0]?.coverThumbhash).toBeUndefined()
    expect(posts[0]?.publishedRevisionId).toBe(revId)
  })
})
