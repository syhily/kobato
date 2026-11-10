import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { adminSession, authorSession, regularSession } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'

// post.detail draft-preview contract: `status=draft` posts are 404 for anonymous/regular users;
// admin and author see the draft. The loader serves the saved `body_html` projection and never
// parses the Lexical row.

const db = getTestDb()

const publishedBody = lexicalBodyWith([lexicalParagraph('Published body.')])
const draftBody = lexicalBodyWith([lexicalParagraph('Draft body.')])

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPublishedPost(slug: string, title: string): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug,
      title,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      visible: true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({
      type: 'post',
      ownerId: postId,
      revisionNo: 1,
      status: 'published',
      body: publishedBody,
      bodyHtml: '<p>Published body.</p>',
    })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

async function seedDraftPost(opts: {
  slug: string
  title?: string
  bodyHtml?: string | null
  authorId?: number | null
}): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.title ?? opts.slug,
      published: false,
      visible: false,
      publishedRevisionId: null,
      authorId: opts.authorId ?? null,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  await db.insert(contentTable).values({
    type: 'post',
    ownerId: postId,
    revisionNo: 1,
    status: 'draft',
    body: draftBody,
    bodyHtml: opts.bodyHtml === undefined ? '<p>Draft body.</p>' : opts.bodyHtml,
  })
  return postId
}

async function seedNeverPublishedPost(slug: string): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({ slug, title: slug, published: true, publishedRevisionId: null })
    .returning({ id: postTable.id })
  return rows[0]!.id
}

const postRoute = await import('@/routes/public/post/detail')

type LoaderResult = {
  post: { title: string }
  bodyHtml: string
  draftMarker: 'draft' | 'unpublished-draft' | 'published-draft' | null
}

function loadPost(slug: string, session: BlogSession) {
  return postRoute.loader(
    makeLoaderArgs({
      request: new Request(`http://localhost/posts/${slug}`),
      session,
      db,
      params: { slug },
    }),
  )
}

async function expectNotFound(slug: string, session: BlogSession) {
  let thrown: unknown
  try {
    await loadPost(slug, session)
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(Response)
  expect((thrown as Response).status).toBe(404)
}

describe('routes/post.detail draft visibility', () => {
  it('serves the published post for anonymous visitors', async () => {
    await seedPublishedPost('hello', 'Hello')

    const result = unwrapLoaderData<LoaderResult>(await loadPost('hello', regularSession()))

    expect(result.bodyHtml).toBe('<p>Published body.</p>')
    expect(result.draftMarker).toBeNull()
  })

  it('404s anonymous visitors on a draft post (status=draft)', async () => {
    await seedDraftPost({ slug: 'secret', title: 'Secret' })

    await expectNotFound('secret', regularSession())
  })

  it('404s anonymous visitors on a post with status=published but no published revision', async () => {
    await seedNeverPublishedPost('never-published')

    await expectNotFound('never-published', regularSession())
  })

  it('404s regular logged-in visitors on a draft post', async () => {
    await seedDraftPost({ slug: 'secret', title: 'Secret' })

    await expectNotFound('secret', regularSession())
  })

  it('shows 【草稿】 for an admin viewing another author’s draft', async () => {
    // Admin id is 1; the draft belongs to author 99 — admins preview anyone's.
    await seedDraftPost({ slug: 'secret', title: 'Secret', authorId: 99 })

    const result = unwrapLoaderData<LoaderResult>(await loadPost('secret', adminSession()))

    expect(result.post.title).toBe('Secret')
    expect(result.bodyHtml).toBe('<p>Draft body.</p>')
    expect(result.draftMarker).toBe('draft')
  })

  it('shows 【草稿】 for an author viewing their own draft', async () => {
    // authorSession() is author id 3.
    await seedDraftPost({ slug: 'secret', title: 'Secret', authorId: 3 })

    const result = unwrapLoaderData<LoaderResult>(await loadPost('secret', authorSession()))

    expect(result.bodyHtml).toBe('<p>Draft body.</p>')
    expect(result.draftMarker).toBe('draft')
  })

  it('404s an author viewing another author’s draft', async () => {
    await seedDraftPost({ slug: 'secret', title: 'Secret', authorId: 99 })

    await expectNotFound('secret', authorSession())
  })

  it('404s an author on an orphaned draft (authorId null)', async () => {
    await seedDraftPost({ slug: 'secret', title: 'Secret' })

    await expectNotFound('secret', authorSession())
  })

  it('computes the projection on read when the draft row carries a NULL body_html (a past 500)', async () => {
    await seedDraftPost({ slug: 'secret', title: 'Secret', bodyHtml: null, authorId: 99 })

    const result = unwrapLoaderData<LoaderResult>(await loadPost('secret', adminSession()))

    expect(result.draftMarker).toBe('draft')
    // The real headless projection renders the seeded paragraph.
    expect(result.bodyHtml).toContain('Draft body.')
  })

  it('does not paint a marker on a published post (admin session)', async () => {
    await seedPublishedPost('hello', 'Hello')

    const result = unwrapLoaderData<LoaderResult>(await loadPost('hello', adminSession()))

    expect(result.bodyHtml).toBe('<p>Published body.</p>')
    expect(result.draftMarker).toBeNull()
  })
})
