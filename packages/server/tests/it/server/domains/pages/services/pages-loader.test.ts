import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { SessionUser } from '@kobato/server/domains/auth/session-storage'

import { isContentRedirectSignal } from '@kobato/api/contracts/public/content'
import { sqliteOf } from '@kobato/db/sqlite/database'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { page as pageTable } from '@kobato/db/sqlite/schema/page'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '@kobato/server/tests/utils/lexical'
import { adminUser } from '@kobato/server/tests/utils/session'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

const pageBody: LexicalEditorState = lexicalBodyWith([lexicalParagraph('Hello')])

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
  const rows = await sqliteOf(db)
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
    const revisions = await sqliteOf(db)
      .insert(contentTable)
      .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await sqliteOf(db).update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  }
  return postId
}

async function seedPage(opts: {
  slug: string
  title: string
  published?: boolean
  body?: LexicalEditorState
  draftBody?: LexicalEditorState
}): Promise<number> {
  const rows = await sqliteOf(db)
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
    const revisions = await sqliteOf(db)
      .insert(contentTable)
      .values({
        type: 'page',
        ownerId: pageId,
        revisionNo: 1,
        status: 'published',
        body: opts.body ?? lexicalBodyWith([]),
      })
      .returning({ id: contentTable.id })
    await sqliteOf(db).update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  }
  if (opts.draftBody !== undefined) {
    await sqliteOf(db)
      .insert(contentTable)
      .values({
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
  return {
    db,
    slug,
    wantsDraftPreview: false,
    viewer,
  }
}

const { loadPagePreview } = await import('@kobato/server/http/loaders/page-preview')

describe('loadPagePreview — slug redirect logic', () => {
  it('returns a 301 redirect signal to /posts/slug when a published post matches', async () => {
    await seedPost({ slug: 'hello' })

    await expect(loadPagePreview(makeArgs('hello'))).resolves.toEqual({
      kind: 'redirect',
      to: '/posts/hello',
      status: 301,
    })
  })

  it('answers NOT_FOUND for an unpublished post (status=draft)', async () => {
    await seedPost({ slug: 'draft-post', published: false, withRevision: false })

    await expect(loadPagePreview(makeArgs('draft-post'))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('answers NOT_FOUND for a deleted post (deletedAt set)', async () => {
    await seedPost({ slug: 'deleted-post', deletedAt: new Date() })

    await expect(loadPagePreview(makeArgs('deleted-post'))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('answers NOT_FOUND for a scheduled post (publishedAt in future)', async () => {
    await seedPost({ slug: 'scheduled-post', publishedAt: new Date('2099-01-01') })

    await expect(loadPagePreview(makeArgs('scheduled-post'))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns page data when slug matches a published page', async () => {
    await seedPage({ slug: 'about', title: 'About', body: pageBody })

    const result = await loadPagePreview(makeArgs('about'))
    if (isContentRedirectSignal(result)) {
      expect.unreachable('expected a page result, got a redirect signal')
    }

    expect(result.page.title).toBe('About')
    expect(result.page.slug).toBe('about')
    expect(result.sourcePage.bodyState).toEqual(pageBody)
    expect(result.draftMarker).toBeNull()
  })

  it('returns a 301 redirect signal when both published post and page match (post wins)', async () => {
    await seedPost({ slug: 'collision' })
    await seedPage({ slug: 'collision', title: 'Collision Page' })

    await expect(loadPagePreview(makeArgs('collision'))).resolves.toEqual({
      kind: 'redirect',
      to: '/posts/collision',
      status: 301,
    })
  })

  it('shows draft to admin when slug has no published page', async () => {
    await seedPage({ slug: 'new-page', title: 'New Page Draft', published: false, draftBody: pageBody })

    const result = await loadPagePreview(makeArgs('new-page', adminUser()))
    if (isContentRedirectSignal(result)) {
      expect.unreachable('expected a page result, got a redirect signal')
    }

    expect(result.draftMarker).toBe('draft')
    expect(result.page.title).toBe('New Page Draft')
    expect(result.sourcePage.bodyState).toEqual(pageBody)
  })

  it('answers NOT_FOUND when slug matches nothing and no admin session', async () => {
    await expect(loadPagePreview(makeArgs('nonexistent'))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
