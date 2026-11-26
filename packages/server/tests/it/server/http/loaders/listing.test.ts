import { isContentRedirectSignal } from '@kobato/api/contracts/public/content'
import { sqliteOf } from '@kobato/db/sqlite/database'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import { listPublicPostCardsPaginated } from '@kobato/server/domains/posts/services/public-query'
import { listingLoader } from '@kobato/server/http/loaders/listing'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedLivePosts(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(2024, 0, i + 1))
    const rows = await sqliteOf(db)
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
    const revisions = await sqliteOf(db)
      .insert(contentTable)
      .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await sqliteOf(db).update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  }
}

function baseArgs(overrides: {
  rawNum: string | undefined
  totalPosts: number
  pageSize?: number
  mergeTailWhenLessThan?: number
  allowEmpty?: boolean
}) {
  return {
    rootPath: '/example',
    locale: 'zh-CN' as const,
    settings: TEST_BLOG_SETTINGS_BUNDLE,
    extra: undefined,
    fetchPage: async () => [],
    ...overrides,
  }
}

describe('listingLoader', () => {
  it('owns the stable offset when a tail merge expands the final page limit', async () => {
    const fetchPage = vi.fn(async () => [])

    const result = await listingLoader(db, {
      ...baseArgs({ rawNum: '2', totalPosts: 13, pageSize: 5, mergeTailWhenLessThan: 4 }),
      fetchPage,
    })
    if (isContentRedirectSignal(result)) {
      expect.unreachable('expected a listing result, got a redirect signal')
    }

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

    const result = await listingLoader(db, { ...baseArgs({ rawNum: undefined, totalPosts: 13 }), settings: pinned })
    if (isContentRedirectSignal(result)) {
      expect.unreachable('expected a listing result, got a redirect signal')
    }

    expect(result.totalPage).toBe(4)
  })

  it('serves the merged tail as real rows through the paginated query', async () => {
    await seedLivePosts(13)

    const result = await listingLoader(db, {
      ...baseArgs({ rawNum: '2', totalPosts: 13, pageSize: 5, mergeTailWhenLessThan: 4 }),
      fetchPage: ({ pageNum, limit, offset }) =>
        listPublicPostCardsPaginated(db, pageNum, limit, { includeHidden: false, includeScheduled: false, offset }),
    })
    if (isContentRedirectSignal(result)) {
      expect.unreachable('expected a listing result, got a redirect signal')
    }

    expect(result.totalPage).toBe(2)
    expect(result.pageNum).toBe(2)
    expect(result.resolvedPosts).toHaveLength(8)
    expect(result.resolvedPosts.map((p) => p.slug)).toEqual(Array.from({ length: 8 }, (_, i) => `post-${7 - i}`))
  })
})

describe('listingLoader — signal contract', () => {
  it('returns a redirect signal to the root path when the page number collapses to 1', async () => {
    const result = await listingLoader(db, baseArgs({ rawNum: '1', totalPosts: 13 }))

    expect(result).toEqual({ kind: 'redirect', to: '/example', status: 302 })
  })

  it('returns a redirect signal to the last page when the page number overflows', async () => {
    const result = await listingLoader(db, baseArgs({ rawNum: '9999', totalPosts: 13, pageSize: 5 }))

    expect(result).toEqual({ kind: 'redirect', to: '/example/page/3', status: 302 })
  })

  it('throws NOT_FOUND for an empty listing that is not allowed to be empty', async () => {
    await expect(listingLoader(db, baseArgs({ rawNum: undefined, totalPosts: 0 }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('serves an empty listing that is allowed to be empty', async () => {
    const result = await listingLoader(db, baseArgs({ rawNum: undefined, totalPosts: 0, allowEmpty: true }))
    if (isContentRedirectSignal(result)) {
      expect.unreachable('expected a listing result, got a redirect signal')
    }

    expect(result.totalPage).toBe(0)
    expect(result.resolvedPosts).toEqual([])
  })

  it('throws NOT_FOUND for a non-numeric page number', async () => {
    await expect(listingLoader(db, baseArgs({ rawNum: 'abc', totalPosts: 13 }))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
