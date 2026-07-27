import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { content } from '@/server/infra/db/schema/content'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'
import { user } from '@/server/infra/db/schema/user'

// Spy mode keeps the originals — the race-window cases stub the reserve
// lookup once so a real `page_slug_key` violation reaches the catch.
vi.mock('@/server/domains/pages/repo', { spy: true })
vi.mock('@/server/domains/pages/services/public-query', { spy: true })

const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

const repo = await import('@/server/domains/pages/repo')
const publicQuery = await import('@/server/domains/pages/services/public-query')
const mutate = await import('@/server/domains/pages/services/mutate')
const adminQuery = await import('@/server/domains/pages/services/admin-query')
const lifecycle = await import('@/server/domains/content/lifecycle')
const { pageLifecycleAdapter } = await import('@/server/domains/pages/services/lifecycle-adapter')

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
})

async function seedPage(overrides: Partial<typeof pageMetaTable.$inferInsert> = {}) {
  const rows = await db
    .insert(pageMetaTable)
    .values({
      slug: overrides.slug ?? `page-${Math.random().toString(36).slice(2)}`,
      title: overrides.title ?? 'Test',
      ...overrides,
    })
    .returning()
  return rows[0]
}

async function seedRevision(ownerId: bigint, status: 'draft' | 'published' = 'published') {
  const rows = await db
    .insert(content)
    .values({
      type: 'page',
      ownerId,
      revisionNo: 1,
      status,
      body: [],
      imageSources: [],
      headings: [],
    })
    .returning()
  return rows[0]
}

async function seedAuthor() {
  const rows = await db
    .insert(user)
    .values({ name: 'Author', email: `a${Math.random().toString(36).slice(2)}@example.com`, password: 'x' })
    .returning()
  return rows[0]
}

describe('pages/repo — listPageMetas', () => {
  it('returns empty array when no pages', async () => {
    expect(await repo.listPageMetas(db, {})).toHaveLength(0)
  })

  it('returns pages joined with authorName', async () => {
    const author = await seedAuthor()
    const p = await seedPage({ title: 'With Author', authorId: author.id })

    const rows = await repo.listPageMetas(db, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(p.id)
    expect(rows[0].authorName).toBe('Author')
  })

  it('filters by deletedStatus=deleted', async () => {
    await seedPage({ title: 'A', deletedAt: new Date() })
    await seedPage({ title: 'B' })

    const rows = await repo.listPageMetas(db, { deletedStatus: 'deleted' })
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('A')
  })

  it('filters by deletedStatus=normal', async () => {
    await seedPage({ title: 'A', deletedAt: new Date() })
    await seedPage({ title: 'B' })

    const rows = await repo.listPageMetas(db, { deletedStatus: 'normal' })
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('B')
  })

  it('filters by published flag', async () => {
    await seedPage({ title: 'Published', published: true })
    await seedPage({ title: 'Unpublished', published: false })

    const rows = await repo.listPageMetas(db, { published: false })
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Unpublished')
  })

  it('filters by authorId', async () => {
    const a = await seedAuthor()
    await seedPage({ title: 'By A', authorId: a.id })
    await seedPage({ title: 'By Nobody' })

    const rows = await repo.listPageMetas(db, { authorId: a.id })
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('By A')
  })

  it('filters by q on slug', async () => {
    await seedPage({ slug: 'about-me', title: 'About' })
    await seedPage({ slug: 'contact', title: 'Contact' })

    const rows = await repo.listPageMetas(db, { q: 'about' })
    expect(rows).toHaveLength(1)
    expect(rows[0].slug).toBe('about-me')
  })

  it('applies limit and offset', async () => {
    await seedPage({ title: 'A' })
    await seedPage({ title: 'B' })
    await seedPage({ title: 'C' })

    const rows = await repo.listPageMetas(db, { limit: 1, offset: 1 })
    expect(rows).toHaveLength(1)
  })
})

describe('pages/repo — countPageMetas', () => {
  it('counts rows', async () => {
    await seedPage({ title: 'A' })
    await seedPage({ title: 'B' })
    expect(await repo.countPageMetas(db, {})).toBe(2)
  })

  it('respects filters', async () => {
    await seedPage({ title: 'A', published: true })
    await seedPage({ title: 'B', published: false })
    expect(await repo.countPageMetas(db, { published: true })).toBe(1)
  })
})

describe('pages/repo — findPageMetaById / findPageMetaBySlug', () => {
  it('returns null for unknown id', async () => {
    expect(await repo.findPageMetaById(db, 9999n)).toBeNull()
  })

  it('returns null for unknown slug', async () => {
    expect(await repo.findPageMetaBySlug(db, 'nope')).toBeNull()
  })

  it('returns row by id', async () => {
    const p = await seedPage({ title: 'Hi' })
    const r = await repo.findPageMetaById(db, p.id)
    expect(r?.title).toBe('Hi')
  })

  it('returns row by slug', async () => {
    const p = await seedPage({ slug: 'find-me', title: 'Hi' })
    const r = await repo.findPageMetaBySlug(db, 'find-me')
    expect(r?.id).toBe(p.id)
  })
})

describe('pages/services/public-query — findPublicPageMetaBySlug', () => {
  it('returns null for soft-deleted', async () => {
    await seedPage({ slug: 'gone', deletedAt: new Date() })
    expect(await publicQuery.findPublicPageMetaBySlug(db, 'gone')).toBeNull()
  })

  it('returns the row when not deleted', async () => {
    await seedPage({ slug: 'live' })
    expect(await publicQuery.findPublicPageMetaBySlug(db, 'live')).not.toBeNull()
  })
})

describe('pages/services/public-query — listPublicPageMetas', () => {
  it('excludes soft-deleted rows', async () => {
    await seedPage({ title: 'A' })
    await seedPage({ title: 'B', deletedAt: new Date() })

    const rows = await publicQuery.listPublicPageMetas(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('A')
  })
})

describe('pages/services/public-query — listSitemapPages', () => {
  it('returns published, non-deleted pages with revision', async () => {
    const rev = await seedRevision(0n)
    await seedPage({ slug: 'live', published: true, publishedRevisionId: rev.id })
    await seedPage({ slug: 'no-rev', published: true, publishedRevisionId: null })
    await seedPage({ slug: 'unpub', published: false, publishedRevisionId: rev.id })
    await seedPage({ slug: 'deleted', published: true, publishedRevisionId: rev.id, deletedAt: new Date() })

    const rows = await publicQuery.listSitemapPages(db)
    expect(rows.map((r) => r.slug)).toEqual(['live'])
  })

  it('filters out future-dated pages', async () => {
    const rev = await seedRevision(0n)
    const future = new Date()
    future.setHours(future.getHours() + 24)
    await seedPage({ slug: 'future', published: true, publishedRevisionId: rev.id, publishedAt: future })

    expect(await publicQuery.listSitemapPages(db)).toHaveLength(0)
  })
})

describe('pages/repo — insert/update/softDelete/restore', () => {
  it('inserts a new row', async () => {
    const r = await repo.insertPageMeta(db, { slug: 'new', title: 'New' })
    expect(r.id).toBeDefined()
    expect(r.title).toBe('New')
  })

  it('updates by id', async () => {
    const p = await seedPage({ title: 'Old' })
    const r = await repo.updatePageMetaById(db, p.id, { title: 'New' })
    expect(r?.title).toBe('New')
  })

  it('soft-deletes a row', async () => {
    const p = await seedPage()
    expect(await repo.softDeletePageMeta(db, p.id)).toBe(true)
    const after = await repo.findPageMetaById(db, p.id)
    expect(after?.deletedAt).not.toBeNull()
  })

  it('soft-delete is idempotent (returns false on second call)', async () => {
    const p = await seedPage()
    expect(await repo.softDeletePageMeta(db, p.id)).toBe(true)
    expect(await repo.softDeletePageMeta(db, p.id)).toBe(false)
  })

  it('restores a soft-deleted row', async () => {
    const p = await seedPage({ deletedAt: new Date() })
    expect(await repo.restorePageMeta(db, p.id)).toBe(true)
    const after = await repo.findPageMetaById(db, p.id)
    expect(after?.deletedAt).toBeNull()
  })
})

describe('pages/services/mutate — createPage', () => {
  it('creates a page with derived slug', async () => {
    const dto = await mutate.createPage(db, { title: 'Hello World' }, null)
    expect(dto.title).toBe('Hello World')
    expect(dto.slug).not.toBe('')
    expect(dto.published).toBe(false)
  })

  it('rejects duplicate slug with CONFLICT', async () => {
    await mutate.createPage(db, { slug: 'dup', title: 'First' }, null)
    await expect(mutate.createPage(db, { slug: 'dup', title: 'Second' }, null)).rejects.toThrow(/已被其它页面/)
  })

  it('maps a raw page_slug_key violation to CONFLICT', async () => {
    await seedPage({ slug: 'raced', title: 'Existing' }) // meta row only, no registry row
    vi.mocked(repo.findPageMetaBySlugForUpdate).mockResolvedValueOnce(null)
    await expect(mutate.createPage(db, { slug: 'raced', title: 'New' }, null)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

describe('pages/services/mutate — updatePageMeta', () => {
  it('throws when no id provided', async () => {
    await expect(mutate.updatePageMeta(db, { title: 'X' })).rejects.toThrow(/requires an id/)
  })

  it('throws NOT_FOUND when page missing', async () => {
    await expect(mutate.updatePageMeta(db, { id: 9999n, title: 'X' })).rejects.toThrow(/页面不存在/)
  })

  it('updates title and slug', async () => {
    const p = await seedPage({ slug: 'old-slug', title: 'Old' })
    const dto = await mutate.updatePageMeta(db, { id: p.id, slug: 'new-slug', title: 'New' })
    expect(dto.title).toBe('New')
    expect(dto.slug).toBe('new-slug')
  })

  it('throws CONFLICT when renaming to an existing slug', async () => {
    await seedPage({ slug: 'taken', title: 'Taken' })
    const p = await seedPage({ slug: 'orig', title: 'Orig' })
    await expect(mutate.updatePageMeta(db, { id: p.id, slug: 'taken', title: 'Orig' })).rejects.toThrow(/已被其它页面/)
  })

  it('maps a raw page_slug_key violation to CONFLICT', async () => {
    await seedPage({ slug: 'raced-taken', title: 'Existing' }) // meta row only, no registry row
    const p = await seedPage({ slug: 'raced-orig', title: 'Orig' })
    vi.mocked(repo.findPageMetaBySlugForUpdate).mockResolvedValueOnce(null)
    await expect(mutate.updatePageMeta(db, { id: p.id, slug: 'raced-taken', title: 'Orig' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

describe('pages/services/mutate — deletePage / restorePage', () => {
  it('deletes and restores a page', async () => {
    const dto = await mutate.createPage(db, { title: 'ToDelete' }, null)
    const r1 = await mutate.deletePage(db, BigInt(dto.id))
    expect(r1.deleted).toBe(true)

    const r2 = await mutate.restorePage(db, BigInt(dto.id))
    expect(r2.restored).toBe(true)
  })

  it('deletePage is idempotent', async () => {
    const p = await seedPage()
    await mutate.deletePage(db, p.id)
    const r = await mutate.deletePage(db, p.id)
    expect(r.deleted).toBe(false)
  })
})

describe('pages/services/mutate — unpublishPage', () => {
  it('throws NOT_FOUND when missing', async () => {
    await expect(mutate.unpublishPage(db, 9999n)).rejects.toThrow(/页面不存在/)
  })

  it('flips published to false', async () => {
    const p = await seedPage({ published: true })
    const dto = await mutate.unpublishPage(db, p.id)
    expect(dto.published).toBe(false)
  })
})

describe('pages/services/admin-query — listPagesForAdmin', () => {
  it('returns empty when no pages', async () => {
    const r = await adminQuery.listPagesForAdmin(db, {})
    expect(r.pages).toHaveLength(0)
    expect(r.total).toBe(0)
  })

  it('returns pages and total', async () => {
    await seedPage({ title: 'A' })
    await seedPage({ title: 'B' })
    const r = await adminQuery.listPagesForAdmin(db, { limit: 1 })
    expect(r.pages).toHaveLength(1)
    expect(r.total).toBe(2)
    expect(r.hasMore).toBe(true)
  })
})

describe('pages/services/admin-query — getPageDetailForAdmin', () => {
  it('throws NOT_FOUND for unknown id', async () => {
    await expect(adminQuery.getPageDetailForAdmin(db, 9999n)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns page with null revisions when none exist', async () => {
    const p = await seedPage()
    const r = await adminQuery.getPageDetailForAdmin(db, p.id)
    expect(r.latestRevision).toBeNull()
    expect(r.publishedRevision).toBeNull()
  })

  it('returns page with revisions when they exist', async () => {
    const p = await seedPage({ publishedRevisionId: null })
    const rev = await seedRevision(p.id, 'draft')
    await db.update(pageMetaTable).set({ publishedRevisionId: rev.id }).where(eq(pageMetaTable.id, p.id))

    const r = await adminQuery.getPageDetailForAdmin(db, p.id)
    expect(r.publishedRevision).not.toBeNull()
  })
})

describe('pages/services/admin-query — listRevisionsForAdmin', () => {
  it('throws NOT_FOUND for unknown page', async () => {
    // Unified with the posts mirror (and pages' own getPageDetailForAdmin):
    // a missing entity surfaces the service-level NOT_FOUND instead of an
    // empty revision list.
    await expect(adminQuery.listRevisionsForAdmin(db, 9999n)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns revisions for a known page', async () => {
    const p = await seedPage()
    await seedRevision(p.id)
    const rows = await adminQuery.listRevisionsForAdmin(db, p.id)
    expect(rows).toHaveLength(1)
  })
})

describe('content/lifecycle (page adapter) — loadDraftPreviewBySlug', () => {
  it('returns null when the page does not exist', async () => {
    expect(await lifecycle.loadDraftPreviewBySlug(db, pageLifecycleAdapter, 'nope')).toBeNull()
  })

  it('returns the page with hasNewerDraft=false when only a published revision exists', async () => {
    const rev = await seedRevision(0n)
    await seedPage({ slug: 'pub', published: true, publishedRevisionId: rev.id })
    const r = await lifecycle.loadDraftPreviewBySlug(db, pageLifecycleAdapter, 'pub')
    expect(r).not.toBeNull()
    expect(r!.hasNewerDraft).toBe(false)
  })

  it('returns the page with hasNewerDraft=true when a draft revision exists', async () => {
    const p = await seedPage({ slug: 'drafty' })
    await seedRevision(p.id, 'draft')
    const r = await lifecycle.loadDraftPreviewBySlug(db, pageLifecycleAdapter, 'drafty')
    expect(r).not.toBeNull()
    expect(r!.hasNewerDraft).toBe(true)
  })
})

describe('content/lifecycle (page adapter) — save result projection', () => {
  it('projects a saved repo result into the wire DTO shape', async () => {
    const p = await seedPage()
    const result = await lifecycle.saveBody(
      db,
      pageLifecycleAdapter,
      { entityId: p.id, body: [], authorId: null },
      'draft',
    )
    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      expect(result.revision.status).toBe('draft')
      expect(result.revision.clientRevisionToken).not.toBe('')
    }
  })
})
