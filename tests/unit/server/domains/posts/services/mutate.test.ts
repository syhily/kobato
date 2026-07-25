import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/domains/content/repos/query', () => ({
  findContentById: vi.fn(),
}))

vi.mock('@/server/domains/content/shared', () => ({
  clearContentCaches: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/domains/posts/projection', () => ({
  toAdminPostDto: vi.fn((row, ctx) => ({ ...row, ...ctx })),
}))

vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostMetaById: vi.fn(),
  findPostMetaBySlugForUpdate: vi.fn(),
}))

vi.mock('@/server/domains/posts/repos/write', () => ({
  restorePostMeta: vi.fn(),
  softDeletePostMeta: vi.fn(),
  updatePostMetaById: vi.fn(),
}))

vi.mock('@/server/domains/posts/services/search-index', () => ({
  indexPost: vi.fn().mockResolvedValue(undefined),
  removePostIndex: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/domains/posts/services/shared', () => ({
  assertOwnPostOr404: vi.fn(),
}))

vi.mock('@/server/infra/db/operations/category', () => ({
  findCategoryById: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/server/infra/db/operations/post-tag', () => ({
  findTagNamesByPostId: vi.fn().mockResolvedValue(['tag1']),
  setPostTags: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/infra/db/operations/slug-registry', () => ({
  deleteSlugRegistryByEntity: vi.fn().mockResolvedValue(undefined),
  findSlugRegistryBySlugForUpdate: vi.fn().mockResolvedValue(null),
  insertSlugRegistry: vi.fn().mockResolvedValue(undefined),
  updateSlugRegistryByEntity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/infra/db/operations/tag', () => ({
  findTagsByNames: vi.fn().mockResolvedValue([{ id: 1n, name: 'tag1' }]),
  seedTagsIfMissing: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/infra/http/errors', () => ({
  DomainError: class DomainError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message)
    }
  },
  isUniqueConstraintError: vi.fn(() => false),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: unknown) {
      return this
    }),
  })),
}))

vi.mock('@/server/infra/search/search', () => ({
  invalidateSearchCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/infra/slug', () => ({
  resolveSlugForTaxonomy: vi.fn((_id, name) => name),
}))

vi.mock('@/server/infra/slug-validation', () => ({
  ensureSlugLegal: vi.fn(),
  resolveSlug: vi.fn((slug: string, title: string) => slug || title),
}))

vi.mock('@/server/infra/slug/reservation', () => ({
  reserveSlugInTransaction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/shared/utils/id', () => ({
  idFromString: vi.fn((id: string) => BigInt(id)),
}))

class FakeQuery {
  rows: unknown[] = []
  inserted: Record<string, unknown> | null = null
  updated: Record<string, unknown> | null = null
  private rejectError: Error | null = null

  insert() {
    return this
  }
  update() {
    return this
  }
  set(patch: Record<string, unknown>) {
    this.updated = patch
    return this
  }
  values(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.inserted = Array.isArray(values) ? values[0] : values
    return this
  }
  where() {
    return this
  }
  returning() {
    return this
  }
  rejectNext(err: Error) {
    this.rejectError = err
    return this
  }

  then(resolve: (value: unknown) => unknown, reject?: (err: unknown) => unknown) {
    if (this.rejectError) {
      const err = this.rejectError
      this.rejectError = null
      return Promise.reject(err).then(resolve, reject)
    }
    if (this.inserted) {
      return Promise.resolve([{ id: 100n, createdAt: new Date(), ...this.inserted }]).then(resolve, reject)
    }
    if (this.updated) {
      return Promise.resolve([{ id: 100n, ...this.updated }]).then(resolve, reject)
    }
    return Promise.resolve(this.rows).then(resolve, reject)
  }
}

function fakeDb(query = new FakeQuery()): NodePgDatabase {
  return {
    insert: () => query.insert(),
    update: () => query.update(),
    transaction: async (fn: (tx: NodePgDatabase) => Promise<unknown>) => fn(fakeDb(query) as NodePgDatabase),
  } as unknown as NodePgDatabase
}

import { findContentById } from '@/server/domains/content/repos/query'
import { clearContentCaches } from '@/server/domains/content/shared'
import { findPostMetaById, findPostMetaBySlugForUpdate } from '@/server/domains/posts/repos/single'
import { restorePostMeta, softDeletePostMeta, updatePostMetaById } from '@/server/domains/posts/repos/write'
import {
  createPost,
  deletePost,
  restorePost,
  unpublishPost,
  updatePostMeta,
} from '@/server/domains/posts/services/mutate'
import { indexPost, removePostIndex } from '@/server/domains/posts/services/search-index'
import { findSlugRegistryBySlugForUpdate, insertSlugRegistry } from '@/server/infra/db/operations/slug-registry'
import { isUniqueConstraintError } from '@/server/infra/http/errors'
import { invalidateSearchCache } from '@/server/infra/search/search'

describe('posts mutate service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(isUniqueConstraintError as ReturnType<typeof vi.fn>).mockReturnValue(false)
  })

  it('creates a post', async () => {
    const db = fakeDb()
    const result = await createPost(db, { slug: 'hello', title: 'Hello', tags: ['tag1'] }, 1n)
    expect(result).toMatchObject({ id: 100n, tags: ['tag1'] })
  })

  it('creates a post on behalf of a non-admin viewer', async () => {
    const db = fakeDb()
    const result = await createPost(db, { slug: 'hello', title: 'Hello' }, null, { userId: '2', role: 'author' })
    expect(result).toMatchObject({ id: 100n })
  })

  it('throws a conflict when slug is taken', async () => {
    const query = new FakeQuery()
    query.rejectNext(new Error('duplicate key value violates unique constraint "post_slug_key"'))
    const db = fakeDb(query)
    ;(isUniqueConstraintError as ReturnType<typeof vi.fn>).mockReturnValue(true)
    await expect(createPost(db, { slug: 'hello', title: 'Hello' }, 1n)).rejects.toThrow('已被占用')
  })

  it('updates post meta', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n, slug: 'old' })
    const result = await updatePostMeta(db, { id: 100n, slug: 'new', title: 'New', tags: ['tag1'] })
    expect(result).toMatchObject({ id: 100n, tags: ['tag1'] })
  })

  it('rejects update without id', async () => {
    const db = fakeDb()
    await expect(updatePostMeta(db, { slug: 'x', title: 'X' })).rejects.toThrow('requires an id')
  })

  it('deletes a post', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n })
    ;(softDeletePostMeta as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    const result = await deletePost(db, 100n)
    expect(result.deleted).toBe(true)
  })

  it('unpublishes a post', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n })
    ;(updatePostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n })
    const result = await unpublishPost(db, 100n)
    expect(result).toMatchObject({ id: 100n })
  })

  it('restores a post and indexes it', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 100n,
      published: true,
      publishedRevisionId: 2n,
      slug: 'hello',
    })
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(findContentById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 2n,
      body: [{ _type: 'block', children: [] }],
    })
    const result = await restorePost(db, 100n)
    expect(result.restored).toBe(true)
  })

  it('warns when restored slug conflicts with another entity', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 100n,
      published: true,
      publishedRevisionId: null,
      slug: 'hello',
    })
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(findSlugRegistryBySlugForUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      entityType: 'page',
      entityId: 2n,
      slug: 'hello',
    })
    const result = await restorePost(db, 100n)
    expect(result.warning).toBeTruthy()
  })

  it('warns when slug registry insert fails during restore', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 100n,
      published: true,
      publishedRevisionId: null,
      slug: 'hello',
    })
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(findSlugRegistryBySlugForUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(insertSlugRegistry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('dup'))
    ;(isUniqueConstraintError as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const result = await restorePost(db, 100n)
    expect(result.warning).toBeTruthy()
  })
})

describe('posts mutate — post-state-change side effects', () => {
  const publishedMeta = {
    id: 100n,
    slug: 'hello',
    title: 'Hello',
    summary: 'S',
    published: true,
    publishedRevisionId: 2n,
  }
  const validBody = [{ _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'hi' }] }]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(isUniqueConstraintError as ReturnType<typeof vi.fn>).mockReturnValue(false)
    ;(findSlugRegistryBySlugForUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(insertSlugRegistry as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  it('restore re-indexes a published post after clearing caches and invalidating search', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue(publishedMeta)
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(findContentById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2n, body: validBody })

    const result = await restorePost(db, 100n)

    expect(result).toEqual({ restored: true, warning: undefined })
    expect(clearContentCaches).toHaveBeenCalledWith(db, 'post', 100n)
    expect(invalidateSearchCache).toHaveBeenCalledTimes(1)
    expect(indexPost).toHaveBeenCalledTimes(1)
    expect(removePostIndex).not.toHaveBeenCalled()
  })

  it('restore returns the exact index-failure warning when re-indexing fails', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue(publishedMeta)
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(findContentById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2n, body: validBody })
    ;(indexPost as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('embedding down'))

    const result = await restorePost(db, 100n)

    expect(result.restored).toBe(true)
    expect(result.warning).toBe('搜索索引更新失败，该文章可能不会出现在搜索结果中。')
  })

  it('restore prepends the slug warning ahead of the index warning', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue(publishedMeta)
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    ;(findSlugRegistryBySlugForUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      entityType: 'page',
      entityId: 2n,
      slug: 'hello',
    })
    ;(findContentById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2n, body: validBody })
    ;(indexPost as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('embedding down'))

    const result = await restorePost(db, 100n)

    expect(result.warning).toBe(
      'slug "hello" 已被另一个页面占用，恢复后该 URL 不会指向此文章。请修改 slug 或先处理占用方。 搜索索引更新失败，该文章可能不会出现在搜索结果中。',
    )
  })

  it('unpublish clears caches, invalidates search, and removes the index row', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n })
    ;(updatePostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n })

    await unpublishPost(db, 100n)

    expect(clearContentCaches).toHaveBeenCalledWith(db, 'post', 100n)
    expect(invalidateSearchCache).toHaveBeenCalledTimes(1)
    expect(removePostIndex).toHaveBeenCalledWith(db, 100n)
    expect(indexPost).not.toHaveBeenCalled()
  })

  it('unpublish swallows an index-removal failure', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n })
    ;(updatePostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n })
    ;(removePostIndex as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('index down'))

    await expect(unpublishPost(db, 100n)).resolves.toMatchObject({ id: 100n })
  })

  it('delete clears caches and invalidates search; the index row goes inside the transaction', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 100n })
    ;(softDeletePostMeta as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    const result = await deletePost(db, 100n)

    expect(result.deleted).toBe(true)
    expect(removePostIndex).toHaveBeenCalledTimes(1)
    expect(clearContentCaches).toHaveBeenCalledWith(db, 'post', 100n)
    expect(invalidateSearchCache).toHaveBeenCalledTimes(1)
    expect(indexPost).not.toHaveBeenCalled()
  })
})
