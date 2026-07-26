import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { RouterContextProvider } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { PortableTextBody } from '@/shared/pt/schema'

import { makePage } from '#/_helpers/catalog'
import { makeRequestContext } from '#/_helpers/request-context'
import { adminUser } from '#/_helpers/session'
import { requestContext } from '@/server/http/request-context'

// Tests for `loadPagePreview` in `@/server/http/loaders/page-preview`.
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

const mockDb = {} as NodePgDatabase

const mocks = vi.hoisted(() => ({
  findPublicPostMetaBySlug: vi.fn(async (): Promise<unknown> => null),
  findPageBySlug: vi.fn(async (): Promise<unknown> => null),
  loadDraftPreviewBySlug: vi.fn(async (): Promise<unknown> => null),
  resolveImageMetaBySources: vi.fn(async () => []),
}))

vi.mock('@/server/domains/posts/repos/single', () => ({
  findPublicPostMetaBySlug: mocks.findPublicPostMetaBySlug,
}))
vi.mock('@/server/domains/pages/repo', () => ({
  findPageBySlug: mocks.findPageBySlug,
  findPageMetaById: vi.fn(async () => null),
  findPublicPageMetaBySlug: vi.fn(async () => null),
}))
vi.mock('@/server/domains/content/lifecycle', () => ({
  loadDraftPreviewBySlug: mocks.loadDraftPreviewBySlug,
}))
vi.mock('@/server/infra/http/etag', () => ({
  ifNoneMatch: () => false,
  weakEtag: () => 'etag',
  notModifiedResponse: (etag: string) => new Response(null, { status: 304, headers: { ETag: etag } }),
}))
vi.mock('@/server/domains/images/services/enhance', () => ({
  resolveImageMetaBySources: mocks.resolveImageMetaBySources,
}))

function makeArgs(slug: string, viewer: SessionUser | null = null) {
  const context = new RouterContextProvider()
  // `loadPagePreview` reads only `viewer` off the canonical request
  // context (draft-preview role gating).
  context.set(requestContext, makeRequestContext({ user: viewer }))
  return {
    db: mockDb,
    slug,
    wantsDraftPreview: false,
    request: new Request(`http://localhost/${slug}`),
    context,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findPublicPostMetaBySlug.mockImplementation(async () => null)
  mocks.findPageBySlug.mockImplementation(async () => null)
  mocks.loadDraftPreviewBySlug.mockImplementation(async () => null)
})

let loadPagePreview: (typeof import('@/server/http/loaders/page-preview'))['loadPagePreview']

beforeAll(async () => {
  const mod = await import('@/server/http/loaders/page-preview')
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

  it('does not redirect for an unpublished post (status=draft)', async () => {
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
    mocks.loadDraftPreviewBySlug.mockImplementation(async () => ({
      preview: draftPage,
      hasNewerDraft: false,
    }))

    const result = await loadPagePreview(makeArgs('new-page', adminUser()))

    expect(result.draftMarker).toBe('draft')
    expect(result.page.title).toBe('New Page Draft')
  })

  it('returns 404 when slug matches nothing and no admin session', async () => {
    await expect(loadPagePreview(makeArgs('nonexistent'))).rejects.toMatchObject({ status: 404 })
  })
})
