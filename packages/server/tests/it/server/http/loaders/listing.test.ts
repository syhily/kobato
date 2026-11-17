import { content as contentTable } from '@kobato/db/schema/content.ts'
import { post as postTable } from '@kobato/db/schema/post.ts'
import { listPublicPostCardsPaginated } from '@kobato/server/domains/posts/services/public-query.ts'
import { listingLoader } from '@kobato/server/http/loaders/listing.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      locale: 'zh-CN',
      settings: TEST_BLOG_SETTINGS_BUNDLE,
      extra: undefined,
    })

    expect(fetchPage).toHaveBeenCalledOnce()
    expect(fetchPage).toHaveBeenCalledWith({ pageNum: 2, limit: 8, offset: 5 })
  })

  it('reads the page size from the pinned settings capture, not the global snapshot', async () => {
    await seedLivePosts(13)
    const content = TEST_BLOG_SETTINGS_BUNDLE.content!
    const pinned = {
      ...TEST_BLOG_SETTINGS_BUNDLE,
      content: { ...content, pagination: { ...content.pagination, posts: 4 } },
    }

    const result = await listingLoader(db, {
      rawNum: undefined,
      totalPosts: 13,
      fetchPage: async () => [],
      rootPath: '/example',
      locale: 'zh-CN',
      settings: pinned,
      extra: undefined,
    })

    // Global page size is 6 → 3 pages; the pinned capture says 4 → 4 pages.
    expect(result.totalPage).toBe(4)
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
      locale: 'zh-CN',
      settings: TEST_BLOG_SETTINGS_BUNDLE,
      extra: undefined,
    })

    expect(result.totalPage).toBe(2)
    expect(result.pageNum).toBe(2)
    expect(result.resolvedPosts).toHaveLength(8)
    // firstPublishedAt desc: page 1 took post-12…post-8; the merged tail is post-7…post-0.
    expect(result.resolvedPosts.map((p) => p.slug)).toEqual(Array.from({ length: 8 }, (_, i) => `post-${7 - i}`))
  })
})
