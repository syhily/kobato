import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/domains/content/revisions', () => ({
  findContentById: vi.fn(),
  findContentsByIds: vi.fn(),
  hydratePublishedRevisions: vi.fn(async () => new Map()),
}))

vi.mock('@/server/domains/content/schemas/live-gate', () => ({
  isLive: vi.fn(() => true),
  liveContentWhere: vi.fn(() => 'live-where'),
}))

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/domains/pages/projection', () => ({
  toCmsPage: vi.fn((meta, revision) => ({ ...meta, revision, body: revision?.body ?? null })),
}))

vi.mock('@/server/infra/db/schema/page', () => ({
  page: {
    id: { name: 'id' },
    slug: { name: 'slug' },
    title: { name: 'title' },
    published: { name: 'published' },
    publishedAt: { name: 'published_at' },
    firstPublishedAt: { name: 'first_published_at' },
    publishedRevisionId: { name: 'published_revision_id' },
    deletedAt: { name: 'deleted_at' },
  },
}))

import { findContentById } from '@/server/domains/content/revisions'
import { isLive } from '@/server/domains/content/schemas/live-gate'
import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { toCmsPage } from '@/server/domains/pages/projection'

class FakeQuery {
  rows: unknown[] = []

  select(columns?: unknown) {
    return this
  }
  from() {
    return this
  }
  where() {
    return this
  }
  orderBy() {
    return this
  }
  limit() {
    return this
  }
  then(resolve: (value: unknown) => unknown, reject?: (err: unknown) => unknown) {
    return Promise.resolve(this.rows).then(resolve, reject)
  }
}

function fakeDb(rows: unknown[] = []): NodePgDatabase {
  const query = new FakeQuery()
  query.rows = rows
  return {
    select: () => query.select(),
  } as unknown as NodePgDatabase
}

import {
  findLivePageBySlug,
  findPageBySlug,
  findPublicPageMetaBySlug,
  listAllPages,
  listPublicPageMetas,
  listSitemapPages,
} from '@/server/domains/pages/services/public-query'

describe('pages services/public-query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(isLive as ReturnType<typeof vi.fn>).mockReturnValue(true)
  })

  it('finds public page meta and lists public pages', async () => {
    const db = fakeDb([{ id: 1n, slug: 'hello', deletedAt: null }])
    expect(await findPublicPageMetaBySlug(db, 'hello')).toBeTruthy()
    const pages = await listPublicPageMetas(db)
    expect(pages).toHaveLength(1)
  })

  it('finds a live page by slug with the slim projection', async () => {
    const db = fakeDb([{ id: 1n, title: 'Hello' }])
    expect(await findLivePageBySlug(db, 'hello')).toEqual({ id: 1n, title: 'Hello' })
  })

  it('lists sitemap pages', async () => {
    const db = fakeDb([{ slug: 'hello', firstPublishedAt: new Date(), publishedAt: new Date() }])
    const rows = await listSitemapPages(db)
    expect(rows).toHaveLength(1)
  })

  it('finds a page by slug', async () => {
    const db = fakeDb([{ id: 1n, slug: 'hello', publishedRevisionId: 2n, deletedAt: null }])
    ;(findContentById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 2n, body: [] })
    ;(toCmsPage as ReturnType<typeof vi.fn>).mockReturnValue({
      ...{ id: 1n, slug: 'hello', body: [], cover: '', coverThumbhash: null, coverWidth: null, coverHeight: null },
    })
    const page = await findPageBySlug(db, 'hello')
    expect(page).not.toBeNull()
    expect(hydrateImageRefs).toHaveBeenCalled()
  })

  it('returns null for invisible page by slug', async () => {
    const db = fakeDb([{ id: 1n, slug: 'hello', deletedAt: null }])
    ;(isLive as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const page = await findPageBySlug(db, 'hello')
    expect(page).toBeNull()
  })

  it('lists all public pages', async () => {
    const db = fakeDb([{ id: 1n, slug: 'a', publishedRevisionId: 2n, deletedAt: null }])
    ;(toCmsPage as ReturnType<typeof vi.fn>).mockReturnValue({ id: 1n, slug: 'a', body: [], cover: '' })
    const pages = await listAllPages(db)
    expect(pages).toHaveLength(1)
  })
})
