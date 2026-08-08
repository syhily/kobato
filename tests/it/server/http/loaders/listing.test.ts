import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { listPublicPostCardsPaginated } from '@/server/domains/posts/services/public-query'
import { listingLoader } from '@/server/http/loaders/listing'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'

// `listingLoader` against the real engine: the tail-merge offset contract is pinned at the callback boundary and end-to-end.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedLivePosts(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(2024, 0, i + 1))
    const rows = await db
      .insert(postTable)
      .values({
        slug: `post-${i}`,
        title: `Post ${i}`,
        published: true,
        publishedAt: date,
        firstPublishedAt: date,
        visible: true,
      })
      .returning({ id: postTable.id })
    const postId = rows[0]!.id
    const revisions = await db
      .insert(contentTable)
      .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  }
}

describe('listingLoader', () => {
  it('owns the stable offset when a tail merge expands the final page limit', async () => {
    const fetchPage = vi.fn(async () => [])

    await listingLoader(db, {
      rawNum: '2',
      totalPosts: 13,
      pageSize: 5,
      mergeTailWhenLessThan: 4,
      fetchPage,
      rootPath: '/example',
      extra: undefined,
    })

    expect(fetchPage).toHaveBeenCalledOnce()
    expect(fetchPage).toHaveBeenCalledWith({ pageNum: 2, limit: 8, offset: 5 })
  })

  it('serves the merged tail as real rows through the paginated query', async () => {
    // 13 posts at pageSize 5: the tail of 3 < threshold 4 merges into page 2 → 8 rows.
    await seedLivePosts(13)

    const result = await listingLoader(db, {
      rawNum: '2',
      totalPosts: 13,
      pageSize: 5,
      mergeTailWhenLessThan: 4,
      fetchPage: ({ pageNum, limit, offset }) =>
        listPublicPostCardsPaginated(db, pageNum, limit, { includeHidden: false, includeScheduled: false, offset }),
      rootPath: '/example',
      extra: undefined,
    })

    expect(result.totalPage).toBe(2)
    expect(result.pageNum).toBe(2)
    expect(result.resolvedPosts).toHaveLength(8)
    // firstPublishedAt desc: page 1 took post-12…post-8; the merged tail is post-7…post-0.
    expect(result.resolvedPosts.map((p) => p.slug)).toEqual(Array.from({ length: 8 }, (_, i) => `post-${7 - i}`))
  })
})
