import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import SearchListRoute from '@/routes/public/search/list'

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
