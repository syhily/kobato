import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import {
  findLivePageBySlug,
  findPageBySlug,
  findPublicPageMetaBySlug,
  listAllPages,
  listPublicPageMetas,
  listSitemapPages,
} from '@kobato/server/domains/pages/services/public-query'
import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { page as pageTable } from '@kobato/server/infra/db/schema/page'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

// pages services/public-query against the real engine — seeded meta rows
// + content revisions instead of the old FakeQuery/driver mocks, so the
// live gate, the slim projections, and the revision join are asserted
// through real query results.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPage(opts: {
  slug: string
  title?: string
  published?: boolean
  publishedAt?: Date
  deletedAt?: Date | null
  body?: LexicalBody
  withRevision?: boolean
}): Promise<number> {
  const rows = await db
    .insert(pageTable)
    .values({
      slug: opts.slug,
      title: opts.title ?? opts.slug,
      published: opts.published ?? true,
      publishedAt: opts.publishedAt ?? new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      deletedAt: opts.deletedAt ?? null,
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  if (opts.withRevision ?? true) {
    const revisions = await db
      .insert(contentTable)
      .values({
        type: 'page',
        ownerId: pageId,
        revisionNo: 1,
        status: 'published',
        body: opts.body ?? { root: { direction: null, format: '', indent: 0, version: 1, type: 'root', children: [] } },
      })
      .returning({ id: contentTable.id })
    await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  }
  return pageId
}

describe('pages services/public-query', () => {
  it('finds public page meta and lists public pages', async () => {
    await seedPage({ slug: 'hello' })

    const meta = await findPublicPageMetaBySlug(db, 'hello')
    expect(meta).toMatchObject({ slug: 'hello', deletedAt: null })

    const pages = await listPublicPageMetas(db)
    expect(pages).toHaveLength(1)
    expect(pages[0]?.slug).toBe('hello')
  })

  it('excludes soft-deleted rows from the public meta lookup', async () => {
    await seedPage({ slug: 'gone', deletedAt: new Date() })

    expect(await findPublicPageMetaBySlug(db, 'gone')).toBeNull()
    expect(await listPublicPageMetas(db)).toHaveLength(0)
  })

  it('finds a live page by slug with the slim projection', async () => {
    await seedPage({ slug: 'hello', title: 'Hello' })

    expect(await findLivePageBySlug(db, 'hello')).toEqual({ id: expect.any(Number), title: 'Hello' })
  })

  it('lists sitemap pages with slug + timestamps only', async () => {
    await seedPage({ slug: 'hello' })

    const rows = await listSitemapPages(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.slug).toBe('hello')
    expect(rows[0]?.firstPublishedAt).toEqual(new Date('2024-01-01'))
    expect(rows[0]?.publishedAt).toEqual(new Date('2024-01-01'))
  })

  it('finds a page by slug with the published revision body joined', async () => {
    const body: LexicalBody = {
      root: {
        direction: null,
        format: '',
        indent: 0,
        version: 1,
        type: 'root',
        children: [
          {
            direction: null,
            format: '',
            indent: 0,
            version: 1,
            type: 'paragraph',
            textFormat: 0,
            textStyle: '',
            children: [
              { detail: 0, format: 0, mode: 'normal', style: '', text: 'Hello page', type: 'text', version: 1 },
            ],
          },
        ],
      },
    }
    await seedPage({ slug: 'hello', body })

    const page = await findPageBySlug(db, 'hello')
    expect(page).not.toBeNull()
    expect(page?.slug).toBe('hello')
    expect(page?.permalink).toBe('/hello')
    expect(page?.body).toEqual(body)
    expect(page?.publishedRevisionId).toEqual(expect.any(Number))
  })

  it('returns null for an unpublished page by slug', async () => {
    await seedPage({ slug: 'hello', published: false, withRevision: false })

    expect(await findPageBySlug(db, 'hello')).toBeNull()
  })

  it('returns null for a scheduled page by slug (publishedAt in the future)', async () => {
    await seedPage({ slug: 'hello', publishedAt: new Date('2099-01-01') })

    expect(await findPageBySlug(db, 'hello')).toBeNull()
  })

  it('lists all live pages and skips non-live rows', async () => {
    await seedPage({ slug: 'live-a' })
    await seedPage({ slug: 'live-b' })
    await seedPage({ slug: 'draft', published: false, withRevision: false })

    const pages = await listAllPages(db)
    expect(pages.map((p) => p.slug).sort()).toEqual(['live-a', 'live-b'])
    expect(pages[0]?.body).toEqual({
      root: { direction: null, format: '', indent: 0, version: 1, type: 'root', children: [] },
    })
  })
})
