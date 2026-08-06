import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { PortableTextBody } from '@/shared/pt/schema'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { adminUser } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'

// Tests for `loadPagePreview` in `@/server/http/loaders/page-preview`.
// The loader uses parallel DB lookups (findPublicPostMetaBySlug +
// findPageBySlug) instead of the old catalog cache (getEntryBySlug).
//
// Real engine: posts/pages are seeded meta rows (+ content revisions),
// so the live gate, the post-wins redirect, and the admin draft preview
// all run against actual rows.

const db = getTestDb()

const pageBody: PortableTextBody = [
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    children: [{ _type: 'span', _key: 'p1s', text: 'Hello' }],
  },
]

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
  body?: PortableTextBody
  draftBody?: PortableTextBody
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
      .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: opts.body ?? [] })
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
  // `loadPagePreview` takes the draft-preview gate inputs as plain values
  // (viewer role + raw If-None-Match header) since the oRPC migration —
  // no canonical request context involved anymore.
  return {
    db,
    slug,
    wantsDraftPreview: false,
    role: viewer?.role,
    ifNoneMatch: null,
  }
}

const { loadPagePreview } = await import('@/server/http/loaders/page-preview')

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
