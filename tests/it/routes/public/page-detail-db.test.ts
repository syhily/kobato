import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalHeading, lexicalParagraph } from '#/_helpers/lexical'
import { regularSession } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'

// page.detail serves the saved `body_html` projection straight through —
// real engine: seeded meta row + published content revision (R13).

const db = getTestDb()
const session = regularSession()

const dbPageBody = lexicalBodyWith([lexicalHeading('h2', 'About'), lexicalParagraph('Hello from a DB-backed page.')])
const dbPageBodyHtml = '<h2 id="about">About</h2><p>Hello from a DB-backed page.</p>'

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
      bodyHtml: dbPageBodyHtml,
      headings: dbPageHeadings,
    })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  return pageId
}

const pageRoute = await import('@/routes/public/page/detail')

describe('routes/page.detail loader (DB-backed page)', () => {
  it('returns the saved body_html projection', async () => {
    await seedAboutPage()

    const result = unwrapLoaderData<{
      page: { permalink: string; title: string }
      bodyHtml: string
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
    expect(result.bodyHtml).toBe(dbPageBodyHtml)
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
