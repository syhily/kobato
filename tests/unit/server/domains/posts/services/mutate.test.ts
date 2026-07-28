import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

vi.mock('@/server/domains/content/revisions', () => ({
  findContentById: vi.fn(),
}))

vi.mock('@/server/domains/content/invalidate', () => ({
  invalidateContent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/domains/posts/projection', () => ({
  toAdminPostDto: vi.fn((row, ctx) => ({ ...row, ...ctx })),
}))

vi.mock('@/server/domains/posts/services/single', () => ({
  findPostMetaById: vi.fn(),
  findPostMetaBySlug: vi.fn(),
  findPostMetaBySlugForUpdate: vi.fn(),
  findPublicPostMetaBySlug: vi.fn(),
}))

vi.mock('@/server/domains/posts/repos/write', () => ({
  insertPostMeta: vi.fn(),
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
  findCategoryNamesByIds: vi.fn().mockReturnValue(new Map()),
}))

vi.mock('@/server/infra/db/operations/post-tag', () => ({
  findTagNamesByPostId: vi.fn().mockReturnValue(['tag1']),
  setPostTags: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/infra/db/operations/slug-registry', () => ({
  deleteSlugRegistryByEntity: vi.fn().mockResolvedValue(undefined),
  findSlugRegistryBySlugForUpdate: vi.fn().mockResolvedValue(null),
  insertSlugRegistry: vi.fn().mockResolvedValue(undefined),
  updateSlugRegistryByEntity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/infra/db/operations/tag', () => ({
  findTagsByNames: vi.fn().mockReturnValue([{ id: 1, name: 'tag1' }]),
  seedTagsIfMissing: vi.fn().mockReturnValue(undefined),
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

vi.mock('@/server/infra/slug/resolve', () => ({
  resolveSlug: vi.fn((slug: string | undefined, fallback: string) => slug || fallback),
}))

vi.mock('@/server/infra/slug/reservation', () => ({
  reserveSlugInTransaction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/shared/utils/id', () => ({
  idFromString: vi.fn((id: string) => Number(id)),
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
  all() {
    if (this.rejectError) {
      const err = this.rejectError
      this.rejectError = null
      throw err
    }
    if (this.inserted) {
      return [{ id: 100, createdAt: new Date(), ...this.inserted }]
    }
    if (this.updated) {
      return [{ id: 100, ...this.updated }]
    }
    return this.rows
  }
  run() {
    return { changes: this.inserted || this.updated ? 1 : 0, lastInsertRowid: 100 }
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
      return Promise.resolve([{ id: 100, createdAt: new Date(), ...this.inserted }]).then(resolve, reject)
    }
    if (this.updated) {
      return Promise.resolve([{ id: 100, ...this.updated }]).then(resolve, reject)
    }
    return Promise.resolve(this.rows).then(resolve, reject)
  }
}

function fakeDb(query = new FakeQuery()): Database {
  return {
    insert: () => query.insert(),
    update: () => query.update(),
    transaction: (fn: (tx: Database) => unknown) => fn(fakeDb(query) as Database),
  } as unknown as Database
}

import { invalidateContent } from '@/server/domains/content/invalidate'
import { findContentById } from '@/server/domains/content/revisions'
import {
  insertPostMeta,
  restorePostMeta,
  softDeletePostMeta,
  updatePostMetaById,
} from '@/server/domains/posts/repos/write'
import {
  createPost,
  deletePost,
  restorePost,
  unpublishPost,
  updatePostMeta,
} from '@/server/domains/posts/services/mutate'
import { indexPost, removePostIndex } from '@/server/domains/posts/services/search-index'
import { findPostMetaById, findPostMetaBySlugForUpdate } from '@/server/domains/posts/services/single'
import { findSlugRegistryBySlugForUpdate, insertSlugRegistry } from '@/server/infra/db/operations/slug-registry'
import { isUniqueConstraintError } from '@/server/infra/http/errors'

describe('posts mutate service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(isUniqueConstraintError as ReturnType<typeof vi.fn>).mockReturnValue(false)
    ;(insertPostMeta as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100, createdAt: new Date() })
  })

  it('creates a post', async () => {
    const db = fakeDb()
    const result = await createPost(db, { slug: 'hello', title: 'Hello', tags: ['tag1'] }, 1)
    expect(result).toMatchObject({ id: 100, tags: ['tag1'] })
  })

  it('creates a post on behalf of a non-admin viewer', async () => {
    const db = fakeDb()
    const result = await createPost(db, { slug: 'hello', title: 'Hello' }, null, { id: '2', role: 'author' })
    expect(result).toMatchObject({ id: 100 })
  })

  it('throws a conflict when slug is taken', async () => {
    const db = fakeDb()
    ;(insertPostMeta as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('UNIQUE constraint failed: post.slug')
    })
    ;(isUniqueConstraintError as ReturnType<typeof vi.fn>).mockReturnValue(true)
    await expect(createPost(db, { slug: 'hello', title: 'Hello' }, 1)).rejects.toThrow('已被占用')
  })

  it('updates post meta', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100, slug: 'old' })
    ;(updatePostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100, slug: 'new' })
    const result = await updatePostMeta(db, { id: 100, slug: 'new', title: 'New', tags: ['tag1'] })
    expect(result).toMatchObject({ id: 100, tags: ['tag1'] })
  })

  it('rejects update without id', async () => {
    const db = fakeDb()
    await expect(updatePostMeta(db, { slug: 'x', title: 'X' })).rejects.toThrow('requires an id')
  })

  it('deletes a post', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100 })
    ;(softDeletePostMeta as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const result = await deletePost(db, 100)
    expect(result.deleted).toBe(true)
  })

  it('unpublishes a post', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100 })
    ;(updatePostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100 })
    const result = await unpublishPost(db, 100)
    expect(result).toMatchObject({ id: 100 })
  })

  it('restores a post and indexes it', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: 100,
      published: true,
      publishedRevisionId: 2,
      slug: 'hello',
    })
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(findContentById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 2,
      body: [{ _type: 'block', children: [] }],
    })
    const result = await restorePost(db, 100)
    expect(result.restored).toBe(true)
  })

  it('warns when restored slug conflicts with another entity', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: 100,
      published: true,
      publishedRevisionId: null,
      slug: 'hello',
    })
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(findSlugRegistryBySlugForUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      entityType: 'page',
      entityId: 2,
      slug: 'hello',
    })
    const result = await restorePost(db, 100)
    expect(result.warning).toBeTruthy()
  })

  it('warns when slug registry insert fails during restore', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      id: 100,
      published: true,
      publishedRevisionId: null,
      slug: 'hello',
    })
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(findSlugRegistryBySlugForUpdate as ReturnType<typeof vi.fn>).mockReturnValue(null)
    ;(insertSlugRegistry as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: index uq_slug_registry_slug')
    })
    ;(isUniqueConstraintError as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const result = await restorePost(db, 100)
    expect(result.warning).toBeTruthy()
  })
})

describe('posts mutate — post-state-change side effects', () => {
  const publishedMeta = {
    id: 100,
    slug: 'hello',
    title: 'Hello',
    summary: 'S',
    published: true,
    publishedRevisionId: 2,
  }
  const validBody = [{ _type: 'block', _key: 'b1', children: [{ _type: 'span', _key: 's1', text: 'hi' }] }]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(isUniqueConstraintError as ReturnType<typeof vi.fn>).mockReturnValue(false)
    ;(findSlugRegistryBySlugForUpdate as ReturnType<typeof vi.fn>).mockReturnValue(null)
    ;(insertSlugRegistry as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
  })

  it('restore re-indexes a published post after invalidating content caches', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue(publishedMeta)
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(findContentById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 2, body: validBody })

    const result = await restorePost(db, 100)

    expect(result).toEqual({ restored: true, warning: undefined })
    expect(invalidateContent).toHaveBeenCalledWith(db, { entity: 'post' })
    expect(indexPost).toHaveBeenCalledTimes(1)
    expect(removePostIndex).not.toHaveBeenCalled()
  })

  it('restore returns the exact index-failure warning when re-indexing fails', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue(publishedMeta)
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(findContentById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 2, body: validBody })
    ;(indexPost as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('embedding down'))

    const result = await restorePost(db, 100)

    expect(result.restored).toBe(true)
    expect(result.warning).toBe('搜索索引更新失败，该文章可能不会出现在搜索结果中。')
  })

  it('restore prepends the slug warning ahead of the index warning', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue(publishedMeta)
    ;(restorePostMeta as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(findSlugRegistryBySlugForUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      entityType: 'page',
      entityId: 2,
      slug: 'hello',
    })
    ;(findContentById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 2, body: validBody })
    ;(indexPost as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('embedding down'))

    const result = await restorePost(db, 100)

    expect(result.warning).toBe(
      'slug "hello" 已被另一个页面占用，恢复后该 URL 不会指向此文章。请修改 slug 或先处理占用方。 搜索索引更新失败，该文章可能不会出现在搜索结果中。',
    )
  })

  it('unpublish invalidates content caches and removes the index row', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100 })
    ;(updatePostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100 })

    await unpublishPost(db, 100)

    expect(invalidateContent).toHaveBeenCalledWith(db, { entity: 'post' })
    expect(removePostIndex).toHaveBeenCalledWith(db, 100)
    expect(indexPost).not.toHaveBeenCalled()
  })

  it('unpublish swallows an index-removal failure', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100 })
    ;(updatePostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100 })
    ;(removePostIndex as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('index down'))

    await expect(unpublishPost(db, 100)).resolves.toMatchObject({ id: 100 })
  })

  it('delete invalidates content caches; the index row goes inside the transaction', async () => {
    const db = fakeDb()
    ;(findPostMetaById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 100 })
    ;(softDeletePostMeta as ReturnType<typeof vi.fn>).mockReturnValue(true)

    const result = await deletePost(db, 100)

    expect(result.deleted).toBe(true)
    expect(removePostIndex).toHaveBeenCalledTimes(1)
    expect(invalidateContent).toHaveBeenCalledWith(db, { entity: 'post' })
    expect(indexPost).not.toHaveBeenCalled()
  })
})
