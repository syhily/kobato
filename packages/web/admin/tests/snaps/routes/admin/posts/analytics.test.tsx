import { asRoute } from '@kobato/test/route-test-utils'
import PostsAnalyticsRoute from '@kobato/web-admin/routes/admin/posts/analytics'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/admin/posts/analytics', () => {
  it('renders the post analytics route', () => {
    const Route = asRoute(PostsAnalyticsRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            post: {
              id: '7',
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
              publishedAt: '2024-01-01T00:00:00.000Z',
              publishedRevisionId: 'revision-1',
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-02T00:00:00.000Z',
              deletedAt: null,
              category: 'general',
              tags: [],
              alias: [],
              authorId: null,
              authorName: 'author',
              pinnedAt: null,
              firstPublishedAt: '2024-01-01T00:00:00.000Z',
              commentCount: 0,
              commentPublicId: '',
            },
            counters: { visits: 0, visitors: 0, referers: 0 },
            initialMetrics: {},
          }}
        />,
        '/admin/posts/7/analytics',
      ),
    )
    expect(html).toContain('文章分析')
    expect(html).toContain('Hello Post')
  })
})
