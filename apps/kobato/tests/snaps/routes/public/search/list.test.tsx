import { asRoute } from '@kobato/test/route-test-utils.tsx'
import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render.tsx'
import { describe, expect, it } from 'vitest'

import SearchListRoute from '@/routes/public/search/list.tsx'

describe('snapshot: routes/public/search/list', () => {
  it('renders the search listing route', () => {
    const Route = asRoute(SearchListRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            title: '【react】搜索结果',
            resolvedPosts: [],
            pageNum: 1,
            totalPage: 0,
            rootPath: '/search/react',
            listingNowIso: '2026-04-25T12:00:00.000Z',
            seo: undefined,
            extra: undefined,
          }}
        />,
        '/search/react',
      ),
    )
    expect(html).toContain('【react】搜索结果')
    expect(html).toContain('抱歉，没有你要找的内容')
  })
})
