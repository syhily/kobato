import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { makeLoaderArgs } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'

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

    const result = await loader(makeLoaderArgs({ request: new Request('http://localhost/archives'), db }))

    // firstPublishedAt desc.
    expect(result.resolvedPosts.map((post) => post.slug)).toEqual(['visible-post', 'hidden-post'])
    expect(typeof result.listingNowIso).toBe('string')
    expect(result.listingNowIso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
