import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PostAnalyticsData } from '@/server/http/loaders/post-analytics'
import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { clearAccessLog, closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { authorSession } from '#/_helpers/session'
import { __adoptAnalyticsHandleForTests, __resetAnalyticsEngineForTests } from '@/server/bootstrap/analytics-lifecycle'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { tag as tagTable } from '@/server/infra/db/schema/taxonomy'
// Parity net for plan 062: /admin/posts/:postId/analytics and
// /editor/post/:id/analytics share `loadPostAnalyticsData`. This test
// pins both routes to identical loader data for the same post so a
// future edit can't silently diverge one shell from the other.
//
// Real engine: the post + tags are real rows in the content database
// and every analytics query (counters / views / heatmap / metrics)
// runs for real against a seeded DuckDB sidecar — ADOPTED into the
// lifecycle engine (no module mock). The only kept seam is the
// presentational view module.
import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@/shared/contracts/analytics'

const analytics = vi.hoisted(() => ({ handle: null as unknown as AnalyticsHandle }))

// Keep the parity test on the loader surface; the shared view is covered
// by the route snapshots.
vi.mock('@/ui/admin/analytics/PostAnalyticsView', () => ({
  PostAnalyticsHeader: () => null,
  PostAnalyticsView: () => null,
}))

const db = getTestDb()
const session = authorSession()

analytics.handle = await createTestAnalyticsDb()
__adoptAnalyticsHandleForTests(analytics.handle)

const adminRoute = await import('@/routes/admin/posts/analytics')
const editorRoute = await import('@/routes/editor/post/analytics')

// Explicit range so `parseAnalyticsSearch` never consults the clock.
const request = new Request('http://localhost/analytics?startAt=1000&endAt=2000')

beforeEach(async () => {
  await clearAllTables(db)
  await clearAccessLog(analytics.handle)
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
    },
    { ts: new Date(1_300_000), visitorHash: 'a', path: '/post/hello', entityType: 'post', entityId: postId },
    { ts: new Date(1_400_000), visitorHash: 'b', path: '/post/hello', entityType: 'post', entityId: postId },
    // A different post's view — must NOT leak into this post's numbers.
    { ts: new Date(1_500_000), visitorHash: 'c', path: '/post/other', entityType: 'post', entityId: postId + 1000 },
  ])
}

describe('post analytics route parity (real db + real analytics)', () => {
  it('returns identical loader data for the same post across both shells', async () => {
    const postId = await seedPost()
    await seedPostTag(postId, 'typescript')
    await seedViews(postId)

    const adminData = unwrapLoaderData<PostAnalyticsData>(
      await adminRoute.loader(makeLoaderArgs({ request, session, db, params: { postId: String(postId) } })),
    )
    const editorData = unwrapLoaderData<PostAnalyticsData>(
      await editorRoute.loader(makeLoaderArgs({ request, session, db, params: { id: String(postId) } })),
    )

    expect(editorData).toEqual(adminData)
  })

  it('exposes the full analytics shape on both routes, with real scoped counters', async () => {
    const postId = await seedPost()
    await seedPostTag(postId, 'typescript')
    await seedViews(postId)

    const adminData = unwrapLoaderData<PostAnalyticsData>(
      await adminRoute.loader(makeLoaderArgs({ request, session, db, params: { postId: String(postId) } })),
    )
    const editorData = unwrapLoaderData<PostAnalyticsData>(
      await editorRoute.loader(makeLoaderArgs({ request, session, db, params: { id: String(postId) } })),
    )

    for (const data of [adminData, editorData]) {
      expect(Object.keys(data).sort()).toEqual(['counters', 'heatmap', 'initialMetrics', 'post', 'views'])
      expect(Object.keys(data.initialMetrics).sort()).toEqual(METRIC_GROUPS.map((g) => METRIC_GROUP_TABS[g][0]!).sort())
      expect(data.post.id).toBe(String(postId))
      expect(data.post.tags).toEqual(['typescript'])
      // Real scoped numbers: the other post's view stayed out.
      expect(data.counters).toEqual({ visits: 3, visitors: 2, referers: 1 })
      expect(data.views.length).toBeGreaterThan(0)
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
