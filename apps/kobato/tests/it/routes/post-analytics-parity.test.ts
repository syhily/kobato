import type { AdminPostAnalyticsData } from '@kobato/contracts/admin.ts'
import type { AnalyticsHandle } from '@kobato/db/duckdb/database.ts'

// Parity net: both analytics shells must return identical loader data for the same post. Real
// engine: real rows + the seeded DuckDB sidecar adopted into the lifecycle; only the view module
// is mocked.
import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@kobato/contracts/analytics.ts'
import { postTag } from '@kobato/db/schema/post-tag.ts'
import { post as postTable } from '@kobato/db/schema/post.ts'
import { tag as tagTable } from '@kobato/db/schema/taxonomy.ts'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle.ts'
import {
  clearAccessEvents,
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
} from '@kobato/test/analytics-db.ts'
import { makeLoaderArgs, unwrapLoaderData } from '@kobato/test/context.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { authorSession } from '@kobato/test/session.ts'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const analytics = vi.hoisted(() => ({ handle: null as unknown as AnalyticsHandle }))

// Loader-surface test; the shared view is covered by the route snapshots.
vi.mock('@kobato/web-admin/ui/analytics/PostAnalyticsView.tsx', () => ({
  PostAnalyticsHeader: () => null,
  PostAnalyticsView: () => null,
}))

const db = getTestDb()
const session = authorSession()

analytics.handle = await createTestAnalyticsDb()
__adoptAnalyticsHandleForTests(analytics.handle)

const adminRoute = await import('@/routes/admin/posts/analytics.tsx')
const editorRoute = await import('@/routes/editor/post/analytics.tsx')

// Explicit range so `parseAnalyticsSearch` never consults the clock.
const request = new Request('http://localhost/analytics?startAt=1000&endAt=2000')

beforeEach(async () => {
  await clearAllTables(db)
  await clearAccessEvents(analytics.handle)
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analytics.handle)
})

async function seedPost(overrides: Record<string, unknown> = {}): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: `post-${Math.random().toString(36).slice(2)}`,
      title: 'Hello Post',
      authorId: 3,
      published: true,
      publishedRevisionId: null,
      firstPublishedAt: new Date('2024-01-01'),
      publishedAt: new Date('2024-01-01'),
      cover: '/images/cover.png',
      visible: true,
      ...overrides,
    })
    .returning({ id: postTable.id })
  return rows[0]!.id
}

async function seedPostTag(postId: number, name: string): Promise<void> {
  const [tag] = await db.insert(tagTable).values({ name, slug: name.toLowerCase() }).returning({ id: tagTable.id })
  await db.insert(postTag).values({ postId, tagId: tag!.id })
}

/** Seed three page views (two distinct visitors, one referer) inside the 1000–2000s range. */
async function seedViews(postId: number): Promise<void> {
  await seedAccessEvents(analytics.handle, [
    {
      ts: new Date(1_200_000),
      visitorHash: 'a',
      path: '/post/hello',
      entityType: 'post',
      entityId: postId,
      refererHost: 'google.com',
      country: 'US',
    },
    {
      ts: new Date(1_300_000),
      visitorHash: 'a',
      path: '/post/hello',
      entityType: 'post',
      entityId: postId,
      country: 'US',
    },
    {
      ts: new Date(1_400_000),
      visitorHash: 'b',
      path: '/post/hello',
      entityType: 'post',
      entityId: postId,
      country: 'US',
    },
    // A different post's view — must NOT leak into this post's numbers.
    {
      ts: new Date(1_500_000),
      visitorHash: 'c',
      path: '/post/other',
      entityType: 'post',
      entityId: postId + 1000,
      country: 'US',
    },
  ])
}

describe('post analytics route parity (real db + real analytics)', () => {
  it('returns identical loader data for the same post across both shells', async () => {
    const postId = await seedPost()
    await seedPostTag(postId, 'typescript')
    await seedViews(postId)

    const adminData = unwrapLoaderData<AdminPostAnalyticsData>(
      await adminRoute.loader(makeLoaderArgs({ request, session, db, params: { postId: String(postId) } })),
    )
    const editorData = unwrapLoaderData<AdminPostAnalyticsData>(
      await editorRoute.loader(makeLoaderArgs({ request, session, db, params: { id: String(postId) } })),
    )

    expect(editorData).toEqual(adminData)
  })

  it('exposes the full analytics shape on both routes, with real scoped counters', async () => {
    const postId = await seedPost()
    await seedPostTag(postId, 'typescript')
    await seedViews(postId)

    const adminData = unwrapLoaderData<AdminPostAnalyticsData>(
      await adminRoute.loader(makeLoaderArgs({ request, session, db, params: { postId: String(postId) } })),
    )
    const editorData = unwrapLoaderData<AdminPostAnalyticsData>(
      await editorRoute.loader(makeLoaderArgs({ request, session, db, params: { id: String(postId) } })),
    )

    for (const data of [adminData, editorData]) {
      expect(Object.keys(data).sort()).toEqual(['counters', 'initialMetrics', 'post'])
      expect(Object.keys(data.initialMetrics).sort()).toEqual(METRIC_GROUPS.map((g) => METRIC_GROUP_TABS[g][0]!).sort())
      expect(data.post.id).toBe(String(postId))
      expect(data.post.tags).toEqual(['typescript'])
      // Real scoped numbers: the other post's view stayed out.
      expect(data.counters).toEqual({ visits: 3, visitors: 2, referers: 1 })
    }
  })

  it('404s both routes for an unknown post', async () => {
    await expect(
      adminRoute.loader(makeLoaderArgs({ request, session, db, params: { postId: '404' } })),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      editorRoute.loader(makeLoaderArgs({ request, session, db, params: { id: '404' } })),
    ).rejects.toMatchObject({ status: 404 })
  })
})
