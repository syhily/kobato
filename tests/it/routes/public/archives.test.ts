import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { ListingPostCardWithMetadata } from '@/shared/types/catalog'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'

type ArchivesPayload = {
  resolvedPosts: ListingPostCardWithMetadata[]
  listingNowIso: string
  eid: string | null
}

// Archives promises completeness: every live post, including hidden ones.
// Real engine: hidden inclusion and scheduled exclusion fall out of the shared live gate.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPost(opts: {
  slug: string
  visible?: boolean
  firstPublishedAt: Date
  publishedAt?: Date
}): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.slug,
      published: true,
      publishedAt: opts.publishedAt ?? opts.firstPublishedAt,
      firstPublishedAt: opts.firstPublishedAt,
      visible: opts.visible ?? true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

const { loader } = await import('@/routes/public/archives')

function loaderEtag(result: unknown): string | null {
  const init = (result as { init?: { headers?: Record<string, string> } }).init
  return init?.headers?.ETag ?? null
}

describe('routes/archives loader — listing revalidation', () => {
  it('stamps the listing ETag and answers a 304 on a repeat request', async () => {
    await seedPost({ slug: 'archived', firstPublishedAt: new Date('2024-01-01') })

    const first = await loader(makeLoaderArgs({ request: new Request('http://localhost/archives'), db }))
    const etag = loaderEtag(first)
    expect(etag).toMatch(/^W\//)

    const second = await loader(
      makeLoaderArgs({
        request: new Request('http://localhost/archives', { headers: { 'If-None-Match': etag! } }),
        db,
      }),
    ).then(
      () => null,
      (response: unknown) => response,
    )

    expect(second).toMatchObject({ status: 304 })
    expect((second as Response).headers.get('ETag')).toBe(etag)
    expect((second as Response).headers.get('Cache-Control')).toBe('private, no-cache')
  })
})

describe('routes/archives loader', () => {
  it('includes visible=false posts while still excluding scheduled posts', async () => {
    await seedPost({ slug: 'visible-post', firstPublishedAt: new Date('2024-01-02') })
    await seedPost({ slug: 'hidden-post', visible: false, firstPublishedAt: new Date('2024-01-01') })
    // Live except a future publishedAt — the scheduled leg of the live gate excludes it.
    await seedPost({
      slug: 'scheduled-post',
      firstPublishedAt: new Date('2024-01-03'),
      publishedAt: new Date('2099-01-01'),
    })

    const result = unwrapLoaderData<ArchivesPayload>(
      await loader(makeLoaderArgs({ request: new Request('http://localhost/archives'), db })),
    )

    // firstPublishedAt desc.
    expect(result.resolvedPosts.map((post) => post.slug)).toEqual(['visible-post', 'hidden-post'])
    expect(typeof result.listingNowIso).toBe('string')
    expect(result.listingNowIso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.eid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
