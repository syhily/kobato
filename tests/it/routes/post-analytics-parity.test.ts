import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PostAnalyticsData } from '@/server/http/loaders/post-analytics'
import type { MetricRow } from '@/shared/contracts/analytics'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { authorSession } from '#/_helpers/session'
import { METRIC_GROUPS, METRIC_GROUP_TABS } from '@/shared/contracts/analytics'

// Parity net for plan 062: /admin/posts/:postId/analytics and
// /editor/post/:id/analytics share `loadPostAnalyticsData`. This test
// pins both routes to identical loader data for the same post so a
// future edit can't silently diverge one shell from the other.

const session = authorSession()

const sampleMeta = {
  id: 7n,
  slug: 'hello-post',
  title: 'Hello Post',
  summary: 'summary',
  cover: '/images/cover.png',
  og: null,
  published: true,
  commentsEnabled: true,
  showToc: true,
  showUpdated: false,
  visible: true,
  publishedAt: new Date('2024-01-01T00:00:00.000Z'),
  publishedRevisionId: 11n,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  deletedAt: null,
  categoryId: null,
  alias: [],
  authorId: null,
  authorName: 'author',
  pinnedAt: null,
  firstPublishedAt: new Date('2024-01-01T00:00:00.000Z'),
}

const metricRows: Record<string, MetricRow[]> = {}

vi.mock('@/server/domains/posts/repos/single', () => ({
  findPostMetaById: vi.fn(async (_db: unknown, id: bigint) => (id === 7n ? sampleMeta : null)),
}))
vi.mock('@/server/infra/db/operations/post-tag', () => ({
  findTagNamesByPostId: vi.fn(async () => ['typescript']),
}))
vi.mock('@/server/domains/analytics/services/counters', () => ({
  queryCounters: vi.fn(async () => ({ visits: 10, visitors: 4, referers: 2 })),
}))
vi.mock('@/server/domains/analytics/services/views', () => ({
  queryViews: vi.fn(async () => [{ time: '2024-01-01T00:00:00.000Z', visits: 10, visitors: 4 }]),
}))
vi.mock('@/server/domains/analytics/services/heatmap', () => ({
  queryHeatmap: vi.fn(async () => [{ weekday: 1, hour: 9, visits: 3, visitors: 2 }]),
}))
vi.mock('@/server/domains/analytics/services/metric', () => ({
  queryMetric: vi.fn(async (_db: unknown, _input: unknown, type: string) => {
    const rows = metricRows[type] ?? [{ name: `${type}-value`, visits: 5, visitors: 3 }]
    metricRows[type] = rows
    return rows
  }),
}))

// Keep the parity test on the loader surface; the shared view is covered
// by the route snapshots.
vi.mock('@/ui/admin/analytics/PostAnalyticsView', () => ({
  PostAnalyticsHeader: () => null,
  PostAnalyticsView: () => null,
}))

const adminRoute = await import('@/routes/admin/posts/analytics')
const editorRoute = await import('@/routes/editor/post/analytics')

// Explicit range so `parseAnalyticsSearch` never consults the clock.
const request = new Request('http://localhost/analytics?startAt=1000&endAt=2000')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('post analytics route parity', () => {
  it('returns identical loader data for the same post across both shells', async () => {
    const adminData = unwrapLoaderData<PostAnalyticsData>(
      await adminRoute.loader(makeLoaderArgs({ request, session, params: { postId: '7' } })),
    )
    const editorData = unwrapLoaderData<PostAnalyticsData>(
      await editorRoute.loader(makeLoaderArgs({ request, session, params: { id: '7' } })),
    )

    expect(editorData).toEqual(adminData)
  })

  it('exposes the full analytics shape on both routes', async () => {
    const adminData = unwrapLoaderData<PostAnalyticsData>(
      await adminRoute.loader(makeLoaderArgs({ request, session, params: { postId: '7' } })),
    )
    const editorData = unwrapLoaderData<PostAnalyticsData>(
      await editorRoute.loader(makeLoaderArgs({ request, session, params: { id: '7' } })),
    )

    for (const data of [adminData, editorData]) {
      expect(Object.keys(data).sort()).toEqual(['counters', 'heatmap', 'initialMetrics', 'post', 'views'])
      expect(Object.keys(data.initialMetrics).sort()).toEqual(METRIC_GROUPS.map((g) => METRIC_GROUP_TABS[g][0]!).sort())
      expect(data.post.id).toBe('7')
      expect(data.post.tags).toEqual(['typescript'])
    }
  })

  it('404s both routes for an unknown post', async () => {
    await expect(
      adminRoute.loader(makeLoaderArgs({ request, session, params: { postId: '404' } })),
    ).rejects.toMatchObject({ status: 404 })
    await expect(editorRoute.loader(makeLoaderArgs({ request, session, params: { id: '404' } }))).rejects.toMatchObject(
      { status: 404 },
    )
  })
})
