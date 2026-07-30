import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { PortableTextBody } from '@/shared/pt/schema'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { adminSession, authorSession, regularSession } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'

// Draft-preview contract for `routes/post.detail`.
//
//   - `status=draft` posts are invisible to anonymous/regular users (404).
//   - Admin and author users see the draft via `loadDraftPreviewBySlug`.
//
// Real engine: posts are seeded meta rows with real published/draft
// content revisions, so the live gate and the draft-preview lifecycle
// run against actual rows instead of mock projections.

// Presentational seam — the loader contract under test never renders.
vi.mock('@/ui/pt/render', () => ({
  PortableTextBody: () => null,
}))

const db = getTestDb()

const publishedBody: PortableTextBody = [
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'Published body.' }],
  },
]

const draftBody: PortableTextBody = [
  {
    _type: 'block',
    _key: 'p2',
    style: 'normal',
    children: [{ _type: 'span', _key: 's2', text: 'Draft body.' }],
  },
]

beforeEach(async () => {
  await clearAllTables(db)
})

/** A live post whose published revision carries `publishedBody`. */
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
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: publishedBody })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

/** A draft post: unpublished, hidden, no published revision pointer, one draft revision. */
async function seedDraftPost(slug: string, title: string): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({ slug, title, published: false, visible: false, publishedRevisionId: null })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'draft', body: draftBody })
  return postId
}

/** `published = true` but never promoted: no published revision id, no revisions. */
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
  body: PortableTextBody
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

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
  })

  it('404s anonymous visitors on a draft post (status=draft)', async () => {
    await seedDraftPost('secret', 'Secret')

    await expectNotFound('secret', regularSession())
  })

  it('404s anonymous visitors on a post with status=published but no published revision', async () => {
    await seedNeverPublishedPost('never-published')

    await expectNotFound('never-published', regularSession())
  })

  it('404s regular logged-in visitors on a draft post', async () => {
    await seedDraftPost('secret', 'Secret')

    await expectNotFound('secret', regularSession())
  })

  it('shows 【草稿】 for an admin viewing a draft post', async () => {
    await seedDraftPost('secret', 'Secret')

    const result = unwrapLoaderData<LoaderResult>(await loadPost('secret', adminSession()))

    expect(result.post.title).toBe('Secret')
    expect(result.body).toEqual(draftBody)
    expect(result.draftMarker).toBe('draft')
  })

  it('shows 【草稿】 for an author viewing a draft post', async () => {
    await seedDraftPost('secret', 'Secret')

    const result = unwrapLoaderData<LoaderResult>(await loadPost('secret', authorSession()))

    expect(result.body).toEqual(draftBody)
    expect(result.draftMarker).toBe('draft')
  })

  it('does not paint a marker on a published post (admin session)', async () => {
    await seedPublishedPost('hello', 'Hello')

    const result = unwrapLoaderData<LoaderResult>(await loadPost('hello', adminSession()))

    expect(result.body).toEqual(publishedBody)
    expect(result.draftMarker).toBeNull()
  })
})
