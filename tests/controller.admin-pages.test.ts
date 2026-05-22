import { call } from '@orpc/server'
import { describe, expect, it, vi } from 'vite-plus/test'

import { makeAuthedCtx } from './_helpers/mock-ctx'

vi.mock('@/server/domains/pages/services/mutate', () => ({
  createPage: vi.fn(),
  deletePage: vi.fn(),
  restorePage: vi.fn(),
  unpublishPage: vi.fn(),
  updatePageMeta: vi.fn(),
}))

vi.mock('@/server/domains/pages/services/admin-query', () => ({
  getPageDetailForAdmin: vi.fn(),
  listPagesForAdmin: vi.fn(),
  listRevisionsForAdmin: vi.fn(),
}))

vi.mock('@/server/domains/pages/services/draft', () => ({
  publishLatest: vi.fn(),
  saveDraft: vi.fn(),
}))

vi.mock('@/server/render/feed/feed-pt-render', () => ({
  renderPortableTextToHtml: vi.fn(),
}))

vi.mock('@/shared/pt/utils', () => ({
  collectHeadings: vi.fn(),
}))

const mutateService = await import('@/server/domains/pages/services/mutate')
const adminQueryService = await import('@/server/domains/pages/services/admin-query')
const draftService = await import('@/server/domains/pages/services/draft')
const { renderPortableTextToHtml } = await import('@/server/render/feed/feed-pt-render')
const { collectHeadings } = await import('@/shared/pt/utils')
const { adminPagesRouter } = await import('@/server/http/controllers/admin/pages.controller')

const pageStub = {
  id: '1',
  slug: 'about',
  title: 'About',
  summary: '',
  cover: '',
  og: null,
  published: false,
  commentsEnabled: true,
  showToc: false,
  showUpdated: false,
  showFriends: false,
  publishedAt: '2026-01-01T00:00:00.000Z',
  publishedRevisionId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  authorId: '1',
  authorName: 'Admin',
  commentCount: 0,
  commentPublicId: 'pid-1',
}

const revisionStub = {
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

describe('adminPagesRouter.get', () => {
  it('throws NOT_FOUND when the page detail is null', async () => {
    vi.mocked(adminQueryService.getPageDetailForAdmin).mockResolvedValueOnce(null as never)
    const ctx = makeAuthedCtx()
    await expect(call(adminPagesRouter.get, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('passes through the detail dto on hit', async () => {
    vi.mocked(adminQueryService.getPageDetailForAdmin).mockResolvedValueOnce({
      page: pageStub as never,
      latestRevision: null,
      publishedRevision: null,
    } as never)
    const ctx = makeAuthedCtx()
    const res = (await call(adminPagesRouter.get, { id: '1' }, { context: ctx })) as { page: { id: string } }
    expect(res.page.id).toBe('1')
  })
})

describe('adminPagesRouter.delete', () => {
  it('throws NOT_FOUND when deletePage yields { deleted: false }', async () => {
    vi.mocked(mutateService.deletePage).mockResolvedValueOnce({ deleted: false } as never)
    const ctx = makeAuthedCtx()
    await expect(call(adminPagesRouter.delete, { id: '1' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('resolves to undefined when deletePage succeeds', async () => {
    vi.mocked(mutateService.deletePage).mockResolvedValueOnce({ deleted: true } as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminPagesRouter.delete, { id: '1' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminPagesRouter.restore', () => {
  it('returns { success: true } when restore succeeds', async () => {
    vi.mocked(mutateService.restorePage).mockResolvedValueOnce({ restored: true } as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminPagesRouter.restore, { id: '1' }, { context: ctx })
    expect(res).toEqual({ success: true })
  })

  it('throws NOT_FOUND when restore yields { restored: false }', async () => {
    vi.mocked(mutateService.restorePage).mockResolvedValueOnce({ restored: false } as never)
    const ctx = makeAuthedCtx()
    await expect(call(adminPagesRouter.restore, { id: '1' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('adminPagesRouter.unpublish', () => {
  it('returns the unpublished page', async () => {
    vi.mocked(mutateService.unpublishPage).mockResolvedValueOnce(pageStub as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminPagesRouter.unpublish, { id: '1' }, { context: ctx })
    expect(res.page.id).toBe('1')
  })
})

describe('adminPagesRouter.saveDraft', () => {
  it('returns saved status on success', async () => {
    vi.mocked(draftService.saveDraft).mockResolvedValueOnce({
      status: 'saved',
      revision: revisionStub as never,
    } as never)
    const ctx = makeAuthedCtx()
    const res = (await call(
      adminPagesRouter.saveDraft,
      { id: '1', body: [], expectedClientRevisionToken: '00000000-0000-4000-8000-000000000000' },
      { context: ctx },
    )) as { status: string }
    expect(res.status).toBe('saved')
  })

  it('returns conflict status when tokens mismatch', async () => {
    vi.mocked(draftService.saveDraft).mockResolvedValueOnce({
      status: 'conflict',
      latest: revisionStub as never,
      expectedToken: '11111111-1111-4000-8000-000000000000',
    } as never)
    const ctx = makeAuthedCtx()
    const res = (await call(
      adminPagesRouter.saveDraft,
      { id: '1', body: [], expectedClientRevisionToken: '00000000-0000-4000-8000-000000000000' },
      { context: ctx },
    )) as { status: string }
    expect(res.status).toBe('conflict')
  })
})

describe('adminPagesRouter.publishLatest', () => {
  it('returns saved status on success', async () => {
    vi.mocked(draftService.publishLatest).mockResolvedValueOnce({
      status: 'saved',
      revision: revisionStub as never,
    } as never)
    const ctx = makeAuthedCtx()
    const res = (await call(
      adminPagesRouter.publishLatest,
      { id: '1', body: [], expectedClientRevisionToken: '00000000-0000-4000-8000-000000000000' },
      { context: ctx },
    )) as { status: string }
    expect(res.status).toBe('saved')
  })
})

describe('adminPagesRouter.preview', () => {
  it('returns html and headings', async () => {
    vi.mocked(renderPortableTextToHtml).mockResolvedValueOnce('<p>hello</p>' as never)
    vi.mocked(collectHeadings).mockReturnValueOnce([{ text: 'Hello', depth: 2, slug: 'hello' }] as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminPagesRouter.preview, { body: [] }, { context: ctx })
    expect(res.html).toBe('<p>hello</p>')
    expect(res.headings).toHaveLength(1)
  })
})

describe('adminPagesRouter.upsertMeta', () => {
  it('creates a page when id is omitted', async () => {
    vi.mocked(mutateService.createPage).mockResolvedValueOnce(pageStub as never)
    const ctx = makeAuthedCtx()
    const res = await call(
      adminPagesRouter.upsertMeta,
      {
        slug: 'about',
        title: 'About',
        summary: '',
        cover: '',
        og: null,
        published: false,
        commentsEnabled: true,
        showToc: false,
        showUpdated: false,
        showFriends: false,
      },
      { context: ctx },
    )
    expect(res.page.id).toBe('1')
  })

  it('updates a page when id is provided', async () => {
    vi.mocked(mutateService.updatePageMeta).mockResolvedValueOnce(pageStub as never)
    const ctx = makeAuthedCtx()
    const res = await call(
      adminPagesRouter.upsertMeta,
      {
        id: '1',
        slug: 'about',
        title: 'About',
        summary: '',
        cover: '',
        og: null,
        published: false,
        commentsEnabled: true,
        showToc: false,
        showUpdated: false,
        showFriends: false,
      },
      { context: ctx },
    )
    expect(res.page.id).toBe('1')
  })
})

describe('adminPagesRouter.listRevisions', () => {
  it('returns revisions for the page', async () => {
    vi.mocked(adminQueryService.listRevisionsForAdmin).mockResolvedValueOnce([revisionStub] as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminPagesRouter.listRevisions, { id: '1' }, { context: ctx })
    expect(res.revisions).toHaveLength(1)
    expect(res.revisions[0].id).toBe('1')
  })
})
