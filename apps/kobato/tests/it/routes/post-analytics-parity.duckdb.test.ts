import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'

import { METRIC_GROUPS, METRIC_GROUP_TABS, type AdminPostAnalyticsData } from '@kobato/api/contracts/admin/analytics'
import { sqliteOf } from '@kobato/db/sqlite/database'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import { postTag } from '@kobato/db/sqlite/schema/post-tag'
import { tag as tagTable } from '@kobato/db/sqlite/schema/taxonomy'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import {
  clearAccessEvents,
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
} from '@kobato/server/tests/utils/analytics-db'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { authorSession } from '@kobato/server/tests/utils/session'
import { unwrapLoaderData } from '@tests/utils/context'
import { stubRouteRequestContext } from '@tests/utils/orpc-client-mock'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/api/browser/client', async () => {
  const { createOrpcClientMockModule } = await import('@tests/utils/orpc-client-mock')
  return createOrpcClientMockModule()
})

const analytics = vi.hoisted(() => ({ handle: null as unknown as AnalyticsHandle }))

vi.mock('@/ui/analytics/PostAnalyticsView', () => ({
  PostAnalyticsHeader: () => null,
  PostAnalyticsView: () => null,
}))

const db = getTestDb()

analytics.handle = await createTestAnalyticsDb()
__adoptAnalyticsHandleForTests(analytics.handle)

const adminRoute = await import('@/routes/admin/posts/analytics')
const editorRoute = await import('@/routes/editor/post/analytics')

const request = new Request('http://localhost/analytics?startAt=1000&endAt=2000')

const paritySession = authorSession()
paritySession.set('csrfToken', 'post-analytics-parity-csrf-token')

function parityArgs(params: Record<string, string>) {
  stubRouteRequestContext({ request, session: paritySession, db })
  return { request, params } as never
}

beforeEach(async () => {
  await clearAllTables(db)
  await clearAccessEvents(analytics.handle)
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analytics.handle)
})

async function seedPost(overrides: Record<string, unknown> = {}): Promise<number> {
  const rows = await sqliteOf(db)
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
  const [tag] = await sqliteOf(db)
    .insert(tagTable)
    .values({ name, slug: name.toLowerCase() })
    .returning({ id: tagTable.id })
  await sqliteOf(db).insert(postTag).values({ postId, tagId: tag!.id })
}

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
      await adminRoute.clientLoader(parityArgs({ postId: String(postId) })),
    )
    const editorData = unwrapLoaderData<AdminPostAnalyticsData>(
      await editorRoute.clientLoader(parityArgs({ id: String(postId) })),
    )

    expect(editorData).toEqual(adminData)
  })

  it('exposes the full analytics shape on both routes, with real scoped counters', async () => {
    const postId = await seedPost()
    await seedPostTag(postId, 'typescript')
    await seedViews(postId)

    const adminData = unwrapLoaderData<AdminPostAnalyticsData>(
      await adminRoute.clientLoader(parityArgs({ postId: String(postId) })),
    )
    const editorData = unwrapLoaderData<AdminPostAnalyticsData>(
      await editorRoute.clientLoader(parityArgs({ id: String(postId) })),
    )

    for (const data of [adminData, editorData]) {
      expect(Object.keys(data).sort()).toEqual(['counters', 'initialMetrics', 'post'])
      expect(Object.keys(data.initialMetrics).sort()).toEqual(METRIC_GROUPS.map((g) => METRIC_GROUP_TABS[g][0]!).sort())
      expect(data.post.id).toBe(String(postId))
      expect(data.post.tags).toEqual(['typescript'])

      expect(data.counters).toEqual({ visits: 3, visitors: 2, referers: 1 })
    }
  })

  it('404s both routes for an unknown post', async () => {
    await expect(adminRoute.clientLoader(parityArgs({ postId: '404' }))).rejects.toMatchObject({ status: 404 })
    await expect(editorRoute.clientLoader(parityArgs({ id: '404' }))).rejects.toMatchObject({ status: 404 })
  })
})
