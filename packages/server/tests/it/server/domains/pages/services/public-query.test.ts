import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { sqliteOf } from '@kobato/db/database'
import { content as contentTable } from '@kobato/db/schema/content'
import { page as pageTable } from '@kobato/db/schema/page'
import {
  findLivePageBySlug,
  findPageBySlug,
  findPublicPageMetaBySlug,
  listSitemapPages,
} from '@kobato/server/domains/pages/services/public-query'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '@kobato/server/tests/utils/lexical'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

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
  body?: LexicalEditorState
  bodyHtml?: string
  bodyHtmlFeed?: string
  withRevision?: boolean
}): Promise<number> {
  const rows = await sqliteOf(db)
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
    const revisions = await sqliteOf(db)
      .insert(contentTable)
      .values({
        type: 'page',
        ownerId: pageId,
        revisionNo: 1,
        status: 'published',
        body: opts.body ?? lexicalBodyWith([]),
        bodyHtml: opts.bodyHtml ?? null,
        bodyHtmlFeed: opts.bodyHtmlFeed ?? null,
      })
      .returning({ id: contentTable.id })
    await sqliteOf(db).update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  }
  return pageId
}

describe('pages services/public-query', () => {
  it('finds public page meta and lists public pages', async () => {
    await seedPage({ slug: 'hello' })

    const meta = await findPublicPageMetaBySlug(db, 'hello')
    expect(meta).toMatchObject({ slug: 'hello', deletedAt: null })
  })

  it('excludes soft-deleted rows from the public meta lookup', async () => {
    await seedPage({ slug: 'gone', deletedAt: new Date() })

    expect(await findPublicPageMetaBySlug(db, 'gone')).toBeNull()
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

  it('finds a page by slug with the published revision projections joined', async () => {
    await seedPage({
      slug: 'hello',
      body: lexicalBodyWith([lexicalParagraph('Hello page')]),
      bodyHtml: '<p>Hello page</p>',
      bodyHtmlFeed: '<p>Hello page</p>',
    })

    const page = await findPageBySlug(db, 'hello')
    expect(page).not.toBeNull()
    expect(page?.slug).toBe('hello')
    expect(page?.permalink).toBe('/hello')
    expect(page?.bodyHtml).toBe('<p>Hello page</p>')
    expect(page?.bodyHtmlFeed).toBe('<p>Hello page</p>')
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
})
