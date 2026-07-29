import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables, closeTestDatabase, createTestDatabase } from '#/_helpers/integration-db'
import { slugRegistry } from '@/server/infra/db/schema/config'
import { content as contentTable, postSearchIndex } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

// search-index is wrapped (not replaced) so the happy paths below run the
// REAL index writes against the real engine; the wrappers only exist to
// inject one-shot failures for the warning branches. Everything else the
// mutate pipeline touches (revisions, slug registry, tags, invalidation)
// runs for real.
vi.mock('@/server/domains/posts/services/search-index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/posts/services/search-index')>()
  return {
    indexPost: vi.fn(actual.indexPost),
    removePostIndex: vi.fn(actual.removePostIndex),
  }
})

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))

const { createPost, deletePost, restorePost, unpublishPost, updatePostMeta } =
  await import('@/server/domains/posts/services/mutate')
const { indexPost, removePostIndex } = await import('@/server/domains/posts/services/search-index')
const indexPostMock = vi.mocked(indexPost)
const removePostIndexMock = vi.mocked(removePostIndex)

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(() => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
})

const VALID_BODY = [
  { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'hi', marks: [] }] },
]

async function seedPublishedPost(slug: string): Promise<{ postId: number; revisionId: number }> {
  const contentRows = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: 0, revisionNo: 1, status: 'published', body: VALID_BODY })
    .returning({ id: contentTable.id })
  const revisionId = contentRows[0]!.id
  const postRows = await db
    .insert(postMetaTable)
    .values({
      slug,
      title: `Post ${slug}`,
      published: true,
      publishedRevisionId: revisionId,
      publishedAt: new Date('2026-01-01'),
      firstPublishedAt: new Date('2026-01-01'),
    })
    .returning({ id: postMetaTable.id })
  const postId = postRows[0]!.id
  await db.update(contentTable).set({ ownerId: postId }).where(eq(contentTable.id, revisionId))
  await db.insert(slugRegistry).values({ slug, entityType: 'post', entityId: postId })
  return { postId, revisionId }
}

async function seedIndexRow(postId: number, plainText = 'hi'): Promise<void> {
  await db.insert(postSearchIndex).values({ postId, plainText, updatedAt: new Date() })
}

async function indexRows(): Promise<(typeof postSearchIndex.$inferSelect)[]> {
  return db.select().from(postSearchIndex)
}

describe('posts/services/mutate — createPost', () => {
  it('creates a post with tags and a slug-registry row', async () => {
    const dto = await createPost(db, { slug: 'hello', title: 'Hello', tags: ['tag1'] }, 1)

    expect(dto.slug).toBe('hello')
    expect(dto.tags).toEqual(['tag1'])

    const meta = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, 'hello'))
    expect(meta).toHaveLength(1)
    expect(meta[0]?.authorId).toBe(1)
    const registry = await db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'hello'))
    expect(registry[0]?.entityType).toBe('post')
    expect(registry[0]?.entityId).toBe(meta[0]!.id)
  })

  it('creates a post on behalf of a non-admin viewer', async () => {
    const dto = await createPost(db, { slug: 'hello', title: 'Hello' }, null, { id: '2', role: 'author' })

    const meta = await db.select().from(postMetaTable).where(eq(postMetaTable.slug, 'hello'))
    expect(meta[0]?.authorId).toBe(2)
    expect(dto.id).toBe(String(meta[0]!.id))
  })

  it('throws CONFLICT when another post already owns the slug', async () => {
    await seedPublishedPost('hello')

    await expect(createPost(db, { slug: 'hello', title: 'Hello' }, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(createPost(db, { slug: 'hello', title: 'Hello' }, 1)).rejects.toThrow(
      'slug "hello" 已被其它文章占用。',
    )
  })

  it('throws CONFLICT when a page already holds the slug in the registry', async () => {
    const pageRows = await db.insert(pageTable).values({ slug: 'cross', title: 'Page cross' }).returning()
    await db.insert(slugRegistry).values({ slug: 'cross', entityType: 'page', entityId: pageRows[0]!.id })

    await expect(createPost(db, { slug: 'cross', title: 'Cross' }, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(createPost(db, { slug: 'cross', title: 'Cross' }, 1)).rejects.toThrow(
      'slug "cross" 已被其它页面占用。',
    )
  })

  it('throws CONFLICT when a stale registry row owns the slug (the registry constraint leg)', async () => {
    // A leftover registry row for a post that no longer has a meta row:
    // the reservation pre-check passes (no meta conflict, same entity
    // type), so the registry insert itself must surface as a clean
    // CONFLICT — SQLite names the columns, never the index name.
    await db.insert(slugRegistry).values({ slug: 'stale', entityType: 'post', entityId: 999 })

    await expect(createPost(db, { slug: 'stale', title: 'Stale' }, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(createPost(db, { slug: 'stale', title: 'Stale' }, 1)).rejects.toThrow('slug "stale" 已被占用。')
  })
})

describe('posts/services/mutate — updatePostMeta', () => {
  it('updates slug/title/tags and moves the registry row', async () => {
    const { postId } = await seedPublishedPost('old')

    const dto = await updatePostMeta(db, { id: postId, slug: 'new', title: 'New', tags: ['tag1'] })

    expect(dto.slug).toBe('new')
    expect(dto.title).toBe('New')
    expect(dto.tags).toEqual(['tag1'])
    const registry = await db.select().from(slugRegistry).where(eq(slugRegistry.entityId, postId))
    expect(registry[0]?.slug).toBe('new')
  })

  it('rejects update without id', async () => {
    await expect(updatePostMeta(db, { slug: 'x', title: 'X' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(updatePostMeta(db, { slug: 'x', title: 'X' })).rejects.toThrow('requires an id')
  })
})

describe('posts/services/mutate — deletePost', () => {
  it('soft-deletes the meta and removes the registry + index rows', async () => {
    const { postId } = await seedPublishedPost('hello')
    await seedIndexRow(postId)
    expect(await indexRows()).toHaveLength(1)

    const result = await deletePost(db, postId)

    expect(result.deleted).toBe(true)
    const meta = await db.select().from(postMetaTable).where(eq(postMetaTable.id, postId))
    expect(meta[0]?.deletedAt).not.toBeNull()
    expect(await db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'hello'))).toHaveLength(0)
    expect(await indexRows()).toHaveLength(0)
    expect(removePostIndexMock).toHaveBeenCalledTimes(1)
    expect(indexPostMock).not.toHaveBeenCalled()
  })
})

describe('posts/services/mutate — unpublishPost', () => {
  it('flips published and removes the index row', async () => {
    const { postId } = await seedPublishedPost('hello')
    await seedIndexRow(postId)

    const dto = await unpublishPost(db, postId)

    expect(dto.published).toBe(false)
    expect(await indexRows()).toHaveLength(0)
    expect(removePostIndexMock).toHaveBeenCalledTimes(1)
    expect(indexPostMock).not.toHaveBeenCalled()
  })

  it('swallows an index-removal failure', async () => {
    const { postId } = await seedPublishedPost('hello')
    removePostIndexMock.mockImplementationOnce(() => {
      throw new Error('index down')
    })

    const dto = await unpublishPost(db, postId)

    expect(dto.published).toBe(false)
  })
})

describe('posts/services/mutate — restorePost', () => {
  it('restores a deleted post, reclaims the slug and re-indexes', async () => {
    const { postId } = await seedPublishedPost('hello')
    await deletePost(db, postId)

    const result = await restorePost(db, postId)

    expect(result).toEqual({ restored: true, warning: undefined })
    const meta = await db.select().from(postMetaTable).where(eq(postMetaTable.id, postId))
    expect(meta[0]?.deletedAt).toBeNull()
    const registry = await db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'hello'))
    expect(registry[0]?.entityId).toBe(postId)
    // afterRestore re-indexed from the published revision body.
    expect(indexPostMock).toHaveBeenCalledTimes(1)
    const rows = await indexRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.plainText).toBe('hi')
  })

  it('returns the exact index-failure warning when re-indexing fails', async () => {
    const { postId } = await seedPublishedPost('hello')
    await deletePost(db, postId)
    indexPostMock.mockRejectedValueOnce(new Error('embedding down'))

    const result = await restorePost(db, postId)

    expect(result.restored).toBe(true)
    expect(result.warning).toBe('搜索索引更新失败，该文章可能不会出现在搜索结果中。')
  })

  it('warns when the restored slug is now owned by a page', async () => {
    const { postId } = await seedPublishedPost('hello')
    await deletePost(db, postId)
    const pageRows = await db.insert(pageTable).values({ slug: 'hello', title: 'Page hello' }).returning()
    await db.insert(slugRegistry).values({ slug: 'hello', entityType: 'page', entityId: pageRows[0]!.id })

    const result = await restorePost(db, postId)

    expect(result.restored).toBe(true)
    expect(result.warning).toBe(
      'slug "hello" 已被另一个页面占用，恢复后该 URL 不会指向此文章。请修改 slug 或先处理占用方。',
    )
    // The page still owns the slug; the post was restored regardless.
    const registry = await db.select().from(slugRegistry).where(eq(slugRegistry.slug, 'hello'))
    expect(registry[0]?.entityType).toBe('page')
  })

  it('prepends the slug warning ahead of the index warning', async () => {
    const { postId } = await seedPublishedPost('hello')
    await deletePost(db, postId)
    const pageRows = await db.insert(pageTable).values({ slug: 'hello', title: 'Page hello' }).returning()
    await db.insert(slugRegistry).values({ slug: 'hello', entityType: 'page', entityId: pageRows[0]!.id })
    indexPostMock.mockRejectedValueOnce(new Error('embedding down'))

    const result = await restorePost(db, postId)

    expect(result.warning).toBe(
      'slug "hello" 已被另一个页面占用，恢复后该 URL 不会指向此文章。请修改 slug 或先处理占用方。 搜索索引更新失败，该文章可能不会出现在搜索结果中。',
    )
  })
})
