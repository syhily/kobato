import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { adminSession, regularSession } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'

// Draft-preview contract for page.detail: three `draftMarker` states,
// only reachable by admin sessions (anonymous `?draft=true` is ignored).
// R13: bodies are Lexical states + the saved `body_html` projection — the
// pre-R13 path 500ed here by force-parsing the Lexical blob as PortableText.

const db = getTestDb()

const publishedBody = lexicalBodyWith([lexicalParagraph('Published body.')])
const draftBody = lexicalBodyWith([lexicalParagraph('Draft body.')])

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedRevision(opts: {
  ownerId: number
  revisionNo: number
  status: 'draft' | 'published'
  body: unknown
  bodyHtml?: string | null
}): Promise<number> {
  const rows = await db
    .insert(contentTable)
    .values({
      type: 'page',
      ownerId: opts.ownerId,
      revisionNo: opts.revisionNo,
      status: opts.status,
      body: opts.body,
      bodyHtml: opts.bodyHtml ?? null,
    })
    .returning({ id: contentTable.id })
  return rows[0]!.id
}

async function seedPublishedPage(slug: string, title: string): Promise<number> {
  const rows = await db
    .insert(pageTable)
    .values({
      slug,
      title,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  const revisionId = await seedRevision({
    ownerId: pageId,
    revisionNo: 1,
    status: 'published',
    body: publishedBody,
    bodyHtml: '<p>Published body.</p>',
  })
  await db.update(pageTable).set({ publishedRevisionId: revisionId }).where(eq(pageTable.id, pageId))
  return pageId
}

async function seedUnpublishedPage(slug: string, title: string): Promise<number> {
  const rows = await db
    .insert(pageTable)
    .values({ slug, title, published: false, publishedRevisionId: null })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  await seedRevision({
    ownerId: pageId,
    revisionNo: 1,
    status: 'draft',
    body: draftBody,
    bodyHtml: '<p>Draft body.</p>',
  })
  return pageId
}

const pageRoute = await import('@/routes/public/page/detail')

type LoaderResult = {
  page: { title: string }
  bodyHtml: string
  draftMarker: 'draft' | 'unpublished-draft' | 'published-draft' | null
}

function loadPage(slug: string, session: BlogSession, draft = false) {
  return pageRoute.loader(
    makeLoaderArgs({
      request: new Request(`http://localhost/${slug}${draft ? '?draft=true' : ''}`),
      session,
      db,
      params: { slug },
    }),
  )
}

describe('routes/page.detail draft preview', () => {
  it('serves the published body without a marker for non-admin visitors', async () => {
    await seedPublishedPage('about', 'About')

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', regularSession()))

    expect(result.bodyHtml).toBe('<p>Published body.</p>')
    expect(result.draftMarker).toBeNull()
  })

  it('ignores `?draft=true` for non-admin visitors on a published page', async () => {
    await seedPublishedPage('about', 'About')

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', regularSession(), true))

    expect(result.bodyHtml).toBe('<p>Published body.</p>')
    expect(result.draftMarker).toBeNull()
  })

  it('404s non-admin visitors on an unpublished page', async () => {
    await seedUnpublishedPage('secret', 'Secret')

    let thrown: unknown
    try {
      await loadPage('secret', regularSession())
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(404)
  })

  it('shows 【草稿】 for an admin viewing an unpublished page', async () => {
    await seedUnpublishedPage('secret', 'Secret')

    const result = unwrapLoaderData<LoaderResult>(await loadPage('secret', adminSession()))

    expect(result.bodyHtml).toBe('<p>Draft body.</p>')
    expect(result.draftMarker).toBe('draft')
  })

  it('shows 【未发布的草稿】 for an admin opening a published page with `?draft=true` when a newer draft exists', async () => {
    const pageId = await seedPublishedPage('about', 'About')
    await seedRevision({
      ownerId: pageId,
      revisionNo: 2,
      status: 'draft',
      body: draftBody,
      bodyHtml: '<p>Draft body.</p>',
    })

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', adminSession(), true))

    expect(result.bodyHtml).toBe('<p>Draft body.</p>')
    expect(result.draftMarker).toBe('unpublished-draft')
  })

  it('computes the projection on read when the draft revision carries a NULL body_html (the R9a 500)', async () => {
    const pageId = await seedPublishedPage('about', 'About')
    await seedRevision({ ownerId: pageId, revisionNo: 2, status: 'draft', body: draftBody, bodyHtml: null })

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', adminSession(), true))

    expect(result.draftMarker).toBe('unpublished-draft')
    // The real headless projection renders the seeded draft paragraph.
    expect(result.bodyHtml).toContain('Draft body.')
  })

  it('shows 【已发布的草稿】 when an admin opens a published page with `?draft=true` and there is no newer draft', async () => {
    await seedPublishedPage('about', 'About')

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', adminSession(), true))

    expect(result.bodyHtml).toBe('<p>Published body.</p>')
    expect(result.draftMarker).toBe('published-draft')
  })

  it('does not paint a marker on a published page when `?draft=true` is absent (admin session)', async () => {
    await seedPublishedPage('about', 'About')

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', adminSession()))

    expect(result.bodyHtml).toBe('<p>Published body.</p>')
    expect(result.draftMarker).toBeNull()
  })
})
