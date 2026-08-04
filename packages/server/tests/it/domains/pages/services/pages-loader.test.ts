import type { SessionUser } from '@kobato/server/domains/auth/session-storage'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { adminUser } from '#/_helpers/session'

import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { page as pageTable } from '@kobato/server/infra/db/schema/page'
import { post as postTable } from '@kobato/server/infra/db/schema/post'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

// Tests for `loadPagePreview` in `@kobato/server/http/loaders/page-preview`.
// The loader uses parallel DB lookups (findPublicPostMetaBySlug +
// findPageBySlug) instead of the old catalog cache (getEntryBySlug).
//
// Real engine: posts/pages are seeded meta rows (+ content revisions),
// so the live gate, the post-wins redirect, and the admin draft preview
// all run against actual rows.

const db = getTestDb()

const pageBody: LexicalBody = {
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
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'Hello', type: 'text', version: 1 }],
      },
    ],
  },
}

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPost(opts: {
  slug: string
  title?: string
  published?: boolean
  publishedAt?: Date
  deletedAt?: Date | null
  withRevision?: boolean
}): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.title ?? opts.slug,
      published: opts.published ?? true,
      publishedAt: opts.publishedAt ?? new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      deletedAt: opts.deletedAt ?? null,
      visible: true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  if (opts.withRevision ?? true) {
    const revisions = await db
      .insert(contentTable)
      .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  }
  return postId
}

async function seedPage(opts: {
  slug: string
  title: string
  published?: boolean
  body?: LexicalBody
  draftBody?: LexicalBody
}): Promise<number> {
  const rows = await db
    .insert(pageTable)
    .values({
      slug: opts.slug,
      title: opts.title,
      published: opts.published ?? true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  if (opts.published ?? true) {
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
  if (opts.draftBody !== undefined) {
    await db.insert(contentTable).values({
      type: 'page',
      ownerId: pageId,
      revisionNo: (opts.published ?? true) ? 2 : 1,
      status: 'draft',
      body: opts.draftBody,
    })
  }
  return pageId
}

function makeArgs(slug: string, viewer: SessionUser | null = null) {
  // `loadPagePreview` reads only `viewer` off the canonical request
  // context (draft-preview role gating).
  const rc = makeRequestContext({ user: viewer })
  return {
    db,
    rc,
    slug,
    wantsDraftPreview: false,
    request: new Request(`http://localhost/${slug}`),
  }
}

const { loadPagePreview } = await import('@kobato/server/http/loaders/page-preview')

describe('loadPagePreview — slug redirect logic', () => {
  it('redirects to /posts/slug when a published post matches', async () => {
    await seedPost({ slug: 'hello' })

    try {
      await loadPagePreview(makeArgs('hello'))
      expect.unreachable('should have thrown')
    } catch (err) {
      // The thrown response should be a 301 redirect
      expect(err).toMatchObject({ status: 301 })
    }
  })

  it('does not redirect for an unpublished post (status=draft)', async () => {
    await seedPost({ slug: 'draft-post', published: false, withRevision: false })

    await expect(loadPagePreview(makeArgs('draft-post'))).rejects.toMatchObject({ status: 404 })
  })

  it('does not redirect for a deleted post (deletedAt set)', async () => {
    await seedPost({ slug: 'deleted-post', deletedAt: new Date() })

    await expect(loadPagePreview(makeArgs('deleted-post'))).rejects.toMatchObject({ status: 404 })
  })

  it('does not redirect for a scheduled post (publishedAt in future)', async () => {
    await seedPost({ slug: 'scheduled-post', publishedAt: new Date('2099-01-01') })

    await expect(loadPagePreview(makeArgs('scheduled-post'))).rejects.toMatchObject({
      status: 404,
    })
  })

  it('returns page data when slug matches a published page', async () => {
    await seedPage({ slug: 'about', title: 'About', body: pageBody })

    const result = await loadPagePreview(makeArgs('about'))

    expect(result.page.title).toBe('About')
    expect(result.page.slug).toBe('about')
    expect(result.body).toEqual(pageBody)
    expect(result.draftMarker).toBeNull()
  })

  it('redirects when both published post and page match (post wins)', async () => {
    await seedPost({ slug: 'collision' })
    await seedPage({ slug: 'collision', title: 'Collision Page' })

    try {
      await loadPagePreview(makeArgs('collision'))
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toMatchObject({ status: 301 })
    }
  })

  it('shows draft to admin when slug has no published page', async () => {
    await seedPage({ slug: 'new-page', title: 'New Page Draft', published: false, draftBody: pageBody })

    const result = await loadPagePreview(makeArgs('new-page', adminUser()))

    expect(result.draftMarker).toBe('draft')
    expect(result.page.title).toBe('New Page Draft')
    expect(result.body).toEqual(pageBody)
  })

  it('returns 404 when slug matches nothing and no admin session', async () => {
    await expect(loadPagePreview(makeArgs('nonexistent'))).rejects.toMatchObject({ status: 404 })
  })
})
