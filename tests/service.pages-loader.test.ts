import { RouterContextProvider } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

import { makePage } from './_helpers/catalog'

// Tests for `loadPagePreview` in `@/server/domains/pages/loader`.
// The loader uses parallel DB lookups (findPublicPostMetaBySlug +
// findPageBySlug) instead of the old catalog cache (getEntryBySlug).

const pageBody: PortableTextBody = [
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    children: [{ _type: 'span', _key: 'p1s', text: 'Hello' }],
  },
]

function makePostMeta(
  overrides: Partial<{
    slug: string
    deletedAt: Date | null
    published: boolean
    publishedRevisionId: bigint | null
    publishedAt: Date
  }> = {},
) {
  return {
    id: 1n,
    slug: 'test-post',
    title: 'Test Post',
    deletedAt: null as Date | null,
    published: true,
    publishedRevisionId: 1n,
    publishedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function makeDbPage(overrides: Record<string, unknown> = {}) {
  return {
    ...makePage({ slug: 'test-page', title: 'Test Page', permalink: '/test-page' }),
    body: pageBody,
    imageSources: [] as string[],
    publishedRevisionId: 10n,
    ...overrides,
  }
}

const mockDb = {} as import('drizzle-orm/node-postgres').NodePgDatabase

const mocks = vi.hoisted(() => ({
  findPublicPostMetaBySlug: vi.fn(async (): Promise<unknown> => null),
  findPageBySlug: vi.fn(async (): Promise<unknown> => null),
  buildDbPage: vi.fn((p: unknown) => p),
  loadPageDraftPreviewBySlug: vi.fn(async (): Promise<unknown> => null),
  tryGetSessionContext: vi.fn((): unknown => null),
  resolveSessionContext: vi.fn(async () => ({ role: 'anonymous', user: null, session: null })),
  resolveImageMetaBySources: vi.fn(async () => []),
}))

vi.mock('@/server/domains/posts/repos/single', () => ({
  findPublicPostMetaBySlug: mocks.findPublicPostMetaBySlug,
}))
vi.mock('@/server/domains/pages/repo', () => ({
  findPageBySlug: mocks.findPageBySlug,
  findPublicPageMetaBySlug: vi.fn(async () => null),
  buildDbPage: mocks.buildDbPage,
}))
vi.mock('@/server/domains/pages/services/draft', () => ({
  loadPageDraftPreviewBySlug: mocks.loadPageDraftPreviewBySlug,
}))
vi.mock('@/server/domains/auth/context', () => ({
  tryGetSessionContext: mocks.tryGetSessionContext,
}))
vi.mock('@/server/domains/auth/primitives', () => ({
  resolveSessionContext: mocks.resolveSessionContext,
}))
vi.mock('@/server/infra/http/etag', () => ({
  ifNoneMatch: () => false,
  weakEtag: () => 'etag',
  notModifiedResponse: (etag: string) => new Response(null, { status: 304, headers: { ETag: etag } }),
}))
vi.mock('@/server/domains/images/image-meta', () => ({
  resolveImageMetaBySources: mocks.resolveImageMetaBySources,
}))

function makeArgs(slug: string) {
  return {
    db: mockDb,
    slug,
    wantsDraftPreview: false,
    request: new Request(`http://localhost/${slug}`),
    context: new RouterContextProvider(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findPublicPostMetaBySlug.mockImplementation(async () => null)
  mocks.findPageBySlug.mockImplementation(async () => null)
  mocks.loadPageDraftPreviewBySlug.mockImplementation(async () => null)
  mocks.tryGetSessionContext.mockReturnValue(null)
  mocks.resolveSessionContext.mockImplementation(async () => ({
    role: 'anonymous',
    user: null,
    session: null,
  }))
})

let loadPagePreview: (typeof import('@/server/domains/pages/loader'))['loadPagePreview']

beforeAll(async () => {
  const mod = await import('@/server/domains/pages/loader')
  loadPagePreview = mod.loadPagePreview
})

describe('loadPagePreview — slug redirect logic', () => {
  it('redirects to /posts/slug when a published post matches', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => makePostMeta({ slug: 'hello' }))

    await expect(loadPagePreview(makeArgs('hello'))).rejects.toThrow()
    // The thrown response should be a 301 redirect
    try {
      await loadPagePreview(makeArgs('hello'))
    } catch (err) {
      expect(err).toMatchObject({ status: 301 })
    }
  })

  it('does not redirect for an unpublished post (published=false)', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => makePostMeta({ published: false }))

    await expect(loadPagePreview(makeArgs('draft-post'))).rejects.toMatchObject({ status: 404 })
  })

  it('does not redirect for a deleted post (deletedAt set)', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => makePostMeta({ deletedAt: new Date() }))

    await expect(loadPagePreview(makeArgs('deleted-post'))).rejects.toMatchObject({ status: 404 })
  })

  it('does not redirect for a scheduled post (publishedAt in future)', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => makePostMeta({ publishedAt: new Date('2099-01-01') }))

    await expect(loadPagePreview(makeArgs('scheduled-post'))).rejects.toMatchObject({
      status: 404,
    })
  })

  it('returns page data when slug matches a published page', async () => {
    const dbPage = makeDbPage({ slug: 'about', title: 'About' })
    mocks.findPageBySlug.mockImplementation(async () => dbPage)

    const result = await loadPagePreview(makeArgs('about'))

    expect(result.page.title).toBe('About')
    expect(result.page.slug).toBe('about')
    expect(result.draftMarker).toBeNull()
  })

  it('redirects when both published post and page match (post wins)', async () => {
    mocks.findPublicPostMetaBySlug.mockImplementation(async () => makePostMeta({ slug: 'collision' }))
    mocks.findPageBySlug.mockImplementation(async () => makeDbPage({ slug: 'collision' }))

    try {
      await loadPagePreview(makeArgs('collision'))
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toMatchObject({ status: 301 })
    }
  })

  it('shows draft to admin when slug has no published page', async () => {
    const draftPage = makeDbPage({ slug: 'new-page', title: 'New Page Draft' })
    mocks.loadPageDraftPreviewBySlug.mockImplementation(async () => ({
      page: draftPage,
      hasNewerDraft: false,
    }))
    mocks.tryGetSessionContext.mockReturnValue({ role: 'admin', user: { id: '1' }, session: {} })

    const result = await loadPagePreview(makeArgs('new-page'))

    expect(result.draftMarker).toBe('draft')
    expect(result.page.title).toBe('New Page Draft')
  })

  it('returns 404 when slug matches nothing and no admin session', async () => {
    await expect(loadPagePreview(makeArgs('nonexistent'))).rejects.toMatchObject({ status: 404 })
  })
})
