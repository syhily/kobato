import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexBody, lexParagraphNode, lexTextNode } from '#/_helpers/lexical-body'
import { regularSession } from '#/_helpers/session'

import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { page as pageTable } from '@kobato/server/infra/db/schema/page'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pages live exclusively in the `page` + `content` tables,
// so this test pins the contract that the `page.detail` loader
// returns the row's canonical Lexical body straight through (the React
// component renders it via `<LexicalBody>`) — real engine: the
// page is a seeded meta row + published content revision and the
// loader, music-meta resolution, image-meta resolution, and comments
// streaming all run for real.

// Presentational seam — the loader contract under test never renders.
vi.mock('@kobato/editor/lexical-html/LexicalBody', () => ({
  LexicalBody: () => null,
}))

const db = getTestDb()
const session = regularSession()

const ELEMENT_BASE = { direction: null, format: '', indent: 0, version: 1 } as const

const dbPageBody: LexicalBody = lexBody([
  { ...ELEMENT_BASE, type: 'heading', tag: 'h2', children: [lexTextNode('About')] },
  lexParagraphNode('Hello from a DB-backed page.'),
  { type: 'image', src: 'https://cdn.example.com/photo.jpg', alt: 'demo', version: 1 },
  { type: 'musicPlayer', playerId: 'abcd1234efgh5678', version: 1 },
])

const dbPageHeadings = [{ depth: 2, text: 'About', slug: 'about' }]

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedAboutPage(): Promise<number> {
  const rows = await db
    .insert(pageTable)
    .values({
      slug: 'about',
      title: 'About',
      cover: '/images/about.jpg',
      commentsEnabled: false,
      showToc: false,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({
      type: 'page',
      ownerId: pageId,
      revisionNo: 1,
      status: 'published',
      body: dbPageBody,
      imageSources: ['https://cdn.example.com/photo.jpg'],
      headings: dbPageHeadings,
    })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  return pageId
}

const pageRoute = await import('@/routes/public/page/detail')

describe('routes/page.detail loader (DB-backed page)', () => {
  it('returns the page row body as canonical Lexical', async () => {
    await seedAboutPage()

    const result = unwrapLoaderData<{
      page: { permalink: string; title: string }
      body: LexicalBody
      imageMeta: Record<string, unknown>
    }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          db,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(result.page.permalink).toBe('/about')
    // The canonical Lexical body shape is preserved end-to-end. The
    // musicPlayer block resolves no players (empty music table) so the
    // music-meta record comes back empty rather than the loader
    // short-circuiting it.
    expect(result.body).toEqual(dbPageBody)
    // Image meta resolution runs for real: the external CDN src matches no
    // stored image rows, so the map comes back empty rather than the
    // loader short-circuiting it.
    expect(result.imageMeta).toEqual({})
  })

  it('preserves headings + permalink so SEO + URL-stable consumers keep working', async () => {
    await seedAboutPage()

    const result = unwrapLoaderData<{
      page: { headings: unknown[]; permalink: string; title: string }
    }>(
      await pageRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          db,
          params: { slug: 'about' },
        }),
      ),
    )

    expect(result.page.permalink).toBe('/about')
    expect(result.page.title).toBe('About')
    expect(result.page.headings).toEqual(dbPageHeadings)
  })
})
