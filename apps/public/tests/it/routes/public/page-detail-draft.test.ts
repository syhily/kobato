import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexParagraphBody } from '#/_helpers/lexical-body'
import { adminSession, regularSession } from '#/_helpers/session'

import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { page as pageTable } from '@kobato/server/infra/db/schema/page'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Draft-preview contract for `routes/page.detail`. Three states the
// route distinguishes via the `draftMarker` discriminator on the
// loader payload (and propagated to `PageDetailBody`):
//
//   - `'draft'`              — page is unpublished; admin sees the
//                              latest draft on the public URL.
//   - `'unpublished-draft'`  — published page + `?draft=true` + a
//                              newer draft revision exists. Body
//                              swaps to the draft.
//   - `'published-draft'`    — published page + `?draft=true` but no
//                              newer draft. Body stays on the
//                              published revision; the badge confirms
//                              parity.
//
// Anonymous visitors (and non-admin sessions) are never allowed to
// trip these branches: `?draft=true` is silently ignored, and an
// unpublished page still 404s.
//
// Real engine: pages are seeded meta rows with real published/draft
// content revisions, so `loadDraftPreviewBySlug` and the live gate run
// against actual rows instead of mock projections.

// Presentational seam — the loader contract under test never renders.
vi.mock('@kobato/editor/lexical-html/LexicalBody', () => ({
  LexicalBody: () => null,
}))

const db = getTestDb()

const publishedBody: LexicalBody = lexParagraphBody('Published body.')

const draftBody: LexicalBody = lexParagraphBody('Draft body.')

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedRevision(opts: {
  ownerId: number
  revisionNo: number
  status: 'draft' | 'published'
  body: LexicalBody
}): Promise<number> {
  const rows = await db
    .insert(contentTable)
    .values({ type: 'page', ownerId: opts.ownerId, revisionNo: opts.revisionNo, status: opts.status, body: opts.body })
    .returning({ id: contentTable.id })
  return rows[0]!.id
}

/** A live page whose published revision carries `publishedBody`. */
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
  const revisionId = await seedRevision({ ownerId: pageId, revisionNo: 1, status: 'published', body: publishedBody })
  await db.update(pageTable).set({ publishedRevisionId: revisionId }).where(eq(pageTable.id, pageId))
  return pageId
}

/** An unpublished page: no published revision pointer, one draft revision. */
async function seedUnpublishedPage(slug: string, title: string): Promise<number> {
  const rows = await db
    .insert(pageTable)
    .values({ slug, title, published: false, publishedRevisionId: null })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  await seedRevision({ ownerId: pageId, revisionNo: 1, status: 'draft', body: draftBody })
  return pageId
}

const pageRoute = await import('@/routes/public/page/detail')

type LoaderResult = {
  page: { title: string }
  body: LexicalBody
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

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
  })

  it('ignores `?draft=true` for non-admin visitors on a published page', async () => {
    await seedPublishedPage('about', 'About')

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', regularSession(), true))

    expect(result.body).toEqual(publishedBody)
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

    expect(result.body).toEqual(draftBody)
    expect(result.draftMarker).toBe('draft')
  })

  it('shows 【未发布的草稿】 for an admin opening a published page with `?draft=true` when a newer draft exists', async () => {
    const pageId = await seedPublishedPage('about', 'About')
    // A newer draft revision (rev 2) sitting on top of the published rev 1.
    await seedRevision({ ownerId: pageId, revisionNo: 2, status: 'draft', body: draftBody })

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', adminSession(), true))

    expect(result.body).toEqual(draftBody)
    expect(result.draftMarker).toBe('unpublished-draft')
  })

  it('shows 【已发布的草稿】 when an admin opens a published page with `?draft=true` and there is no newer draft', async () => {
    await seedPublishedPage('about', 'About')

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', adminSession(), true))

    // No newer draft → body stays on the published revision.
    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBe('published-draft')
  })

  it('does not paint a marker on a published page when `?draft=true` is absent (admin session)', async () => {
    await seedPublishedPage('about', 'About')

    const result = unwrapLoaderData<LoaderResult>(await loadPage('about', adminSession()))

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
  })
})
