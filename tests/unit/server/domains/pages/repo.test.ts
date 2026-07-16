import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    getColumns: vi.fn(() => ({})),
  }
})

vi.mock('@/server/domains/content/repos/query', () => ({
  findContentById: vi.fn(),
  findContentsByIds: vi.fn(),
  hydratePublishedRevisions: vi.fn(async () => new Map()),
}))

vi.mock('@/server/domains/content/schema', () => ({
  isLive: vi.fn(() => true),
  liveContentWhere: vi.fn(() => 'live-where'),
}))

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/domains/pages/projection', () => ({
  toCmsPage: vi.fn((meta, revision) => ({ ...meta, revision, body: revision?.body ?? null })),
}))

vi.mock('@/server/infra/db/ilike-escape', () => ({
  ilikeEscape: vi.fn((column, value) => ({ column, value })),
}))

vi.mock('@/server/infra/db/schema/page', () => ({
  page: {
    id: { name: 'id' },
    slug: { name: 'slug' },
    title: { name: 'title' },
    summary: { name: 'summary' },
    cover: { name: 'cover' },
    coverThumbhash: { name: 'cover_thumbhash' },
    coverWidth: { name: 'cover_width' },
    coverHeight: { name: 'cover_height' },
    og: { name: 'og' },
    published: { name: 'published' },
    publishedAt: { name: 'published_at' },
    firstPublishedAt: { name: 'first_published_at' },
    publishedRevisionId: { name: 'published_revision_id' },
    authorId: { name: 'author_id' },
    deletedAt: { name: 'deleted_at' },
    createdAt: { name: 'created_at' },
    updatedAt: { name: 'updated_at' },
    showToc: { name: 'show_toc' },
    showUpdated: { name: 'show_updated' },
    showFriends: { name: 'show_friends' },
    comments: { name: 'comments' },
    commentsEnabled: { name: 'comments_enabled' },
    toc: { name: 'toc' },
    headings: { name: 'headings' },
    permalink: { name: 'permalink' },
    imageSources: { name: 'image_sources' },
    body: { name: 'body' },
    date: { name: 'date' },
  },
}))

vi.mock('@/server/infra/db/schema/user', () => ({
  user: { id: { name: 'id' }, name: { name: 'name' } },
}))

import { findContentById, findContentsByIds } from '@/server/domains/content/repos/query'
import { isLive } from '@/server/domains/content/schema'
import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import { toCmsPage } from '@/server/domains/pages/projection'

class FakeQuery {
  rows: unknown[] = []
  inserted: Record<string, unknown> | null = null
  updated: Record<string, unknown> | null = null

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
  offset() {
    return this
  }
  leftJoin() {
    return this
  }
  for() {
    return this
  }
  insert() {
    return this
  }
  values(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.inserted = Array.isArray(values) ? values[0] : values
    return this
  }
  update() {
    return this
  }
  set(patch: Record<string, unknown>) {
    this.updated = patch
    return this
  }
  returning() {
    return this
  }
  then(resolve: (value: unknown) => unknown, reject?: (err: unknown) => unknown) {
    if (this.inserted) {
      return Promise.resolve([{ id: 1n, createdAt: new Date(), ...this.inserted }]).then(resolve, reject)
    }
    if (this.updated) {
      return Promise.resolve([{ id: 1n, ...this.updated }]).then(resolve, reject)
    }
    return Promise.resolve(this.rows).then(resolve, reject)
  }
}

function fakeDb(rows: unknown[] = []): NodePgDatabase {
  const query = new FakeQuery()
  query.rows = rows
  return {
    select: () => query.select(),
    insert: () => query.insert(),
    update: () => query.update(),
    transaction: async (fn: (tx: NodePgDatabase) => Promise<unknown>) => fn(fakeDb(rows) as NodePgDatabase),
  } as unknown as NodePgDatabase
}

import {
  buildDbPage,
  countPageMetas,
  findPageBySlug,
  findPageMetaById,
  findPageMetaBySlug,
  findPageMetaBySlugForUpdate,
  findPublicPageMetaBySlug,
  insertPageMeta,
  listAllPages,
  listPageMetas,
  listPublicPageMetas,
  listSitemapPages,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from '@/server/domains/pages/repo'

describe('pages repo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(isLive as ReturnType<typeof vi.fn>).mockReturnValue(true)
  })

  it('lists, counts, and filters page metas', async () => {
    const db = fakeDb([{ id: 1n, title: 'Page', authorName: 'Admin' }])
    const rows = await listPageMetas(db, {
      q: 'page',
      deletedStatus: 'normal',
      published: true,
      authorId: 1n,
      limit: 10,
      offset: 0,
    })
    expect(rows).toHaveLength(1)
    const count = await countPageMetas(db, { deletedStatus: 'deleted' })
    expect(count).toBe(0)
  })

  it('finds a page meta by id, slug, and for update', async () => {
    const db = fakeDb([{ id: 1n, slug: 'hello' }])
    expect(await findPageMetaById(db, 1n)).toBeTruthy()
    expect(await findPageMetaBySlug(db, 'hello')).toBeTruthy()
    expect(await findPageMetaBySlugForUpdate(db, 'hello')).toBeTruthy()
  })

  it('finds public page meta and lists public pages', async () => {
    const db = fakeDb([{ id: 1n, slug: 'hello', deletedAt: null }])
    expect(await findPublicPageMetaBySlug(db, 'hello')).toBeTruthy()
    const pages = await listPublicPageMetas(db)
    expect(pages).toHaveLength(1)
  })

  it('lists sitemap pages', async () => {
    const db = fakeDb([{ slug: 'hello', firstPublishedAt: new Date(), publishedAt: new Date() }])
    const rows = await listSitemapPages(db)
    expect(rows).toHaveLength(1)
  })

  it('inserts and updates page meta', async () => {
    const db = fakeDb()
    const inserted = await insertPageMeta(db, { slug: 'new', title: 'New' } as never)
    expect(inserted.id).toBe(1n)
    const updated = await updatePageMetaById(db, 1n, { title: 'Updated' })
    expect(updated).toBeTruthy()
  })

  it('soft-deletes and restores page meta', async () => {
    const db = fakeDb([{ id: 1n, deletedAt: null }])
    expect(await softDeletePageMeta(db, 1n)).toBe(true)
    expect(await restorePageMeta(db, 1n)).toBe(true)
  })

  it('builds a public page DTO', () => {
    const cms = {
      id: 1n,
      title: 'T',
      date: new Date(),
      updated: new Date(),
      comments: 0,
      cover: '',
      coverThumbhash: null,
      coverWidth: null,
      coverHeight: null,
      og: null,
      published: true,
      summary: '',
      toc: [],
      showUpdated: false,
      showFriends: false,
      slug: 's',
      permalink: '/s',
      headings: [],
      body: [],
      imageSources: [],
      publishedRevisionId: null,
    } as never
    const page = buildDbPage(cms)
    expect(page.slug).toBe('s')
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
    ;(findContentsByIds as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 2n, body: [] }])
    ;(toCmsPage as ReturnType<typeof vi.fn>).mockReturnValue({ id: 1n, slug: 'a', body: [], cover: '' })
    const pages = await listAllPages(db)
    expect(pages).toHaveLength(1)
  })
})
