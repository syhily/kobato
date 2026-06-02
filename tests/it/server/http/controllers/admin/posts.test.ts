import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/posts/services/mutate', () => ({
  createPost: vi.fn(),
  deletePost: vi.fn(),
  restorePost: vi.fn(),
  unpublishPost: vi.fn(),
  updatePostMeta: vi.fn(),
}))

vi.mock('@/server/domains/posts/services/admin-query', () => ({
  getPostDetailForAdmin: vi.fn(),
  listPostsForAdmin: vi.fn(),
  listRevisionsForAdmin: vi.fn(),
}))

vi.mock('@/server/domains/posts/services/draft', () => ({
  publishLatest: vi.fn(),
  saveDraft: vi.fn(),
}))

vi.mock('@/server/domains/posts/preview', () => ({
  renderPortableTextToHtml: vi.fn(),
}))

const mutateService = await import('@/server/domains/posts/services/mutate')
const adminQueryService = await import('@/server/domains/posts/services/admin-query')
const draftService = await import('@/server/domains/posts/services/draft')
const { adminPostsRouter } = await import('@/server/http/controllers/admin/posts.controller')

describe('adminPostsRouter.get', () => {
  it('throws NOT_FOUND when the post detail is null', async () => {
    vi.mocked(adminQueryService.getPostDetailForAdmin).mockResolvedValueOnce(null)
    const ctx = makeAuthedCtx()
    await expect(call(adminPostsRouter.get, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('passes through the detail dto on hit', async () => {
    const post = {
      id: '1',
      slug: 's',
      title: 't',
      summary: '',
      cover: '',
      og: null,
      published: false,
      commentsEnabled: true,
      showToc: true,
      showUpdated: true,
      visible: true,
      publishedAt: '2026-01-01T00:00:00.000Z',
      publishedRevisionId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      category: 'general',
      tags: [],
      alias: [],
      authorId: null,
      authorName: null,
      pinnedAt: null,
      firstPublishedAt: null,
      commentCount: 0,
      commentPublicId: 'pid-1',
    }
    vi.mocked(adminQueryService.getPostDetailForAdmin).mockResolvedValueOnce({
      post: post,
      latestRevision: null,
      publishedRevision: null,
    })
    const ctx = makeAuthedCtx()
    const res = (await call(adminPostsRouter.get, { id: '1' }, { context: ctx })) as {
      post: { id: string }
    }
    expect(res.post.id).toBe('1')
  })
})

describe('adminPostsRouter.delete', () => {
  it('throws NOT_FOUND when deletePost yields { deleted: false }', async () => {
    vi.mocked(mutateService.deletePost).mockResolvedValueOnce({ deleted: false })
    const ctx = makeAuthedCtx()
    await expect(call(adminPostsRouter.delete, { id: '1' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('resolves to undefined when deletePost succeeds (z.void output)', async () => {
    vi.mocked(mutateService.deletePost).mockResolvedValueOnce({ deleted: true })
    const ctx = makeAuthedCtx()
    const res = await call(adminPostsRouter.delete, { id: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminPostsRouter.saveDraft', () => {
  it('discriminates `saved` and `conflict` shapes on the union response', async () => {
    const revision = {
      id: '1',
      revisionNo: 1,
      status: 'draft' as const,
      body: [],
      imageSources: [],
      headings: [],
      authorId: '1',
      clientRevisionToken: '00000000-0000-4000-8000-000000000000',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    vi.mocked(draftService.saveDraft).mockResolvedValueOnce({
      status: 'saved',
      revision: revision,
    })
    const ctx = makeAuthedCtx()
    const res = (await call(
      adminPostsRouter.saveDraft,
      { id: '1', body: [], expectedClientRevisionToken: '00000000-0000-4000-8000-000000000000' },
      { context: ctx },
    )) as { status: string }
    expect(res.status).toBe('saved')
  })
})
