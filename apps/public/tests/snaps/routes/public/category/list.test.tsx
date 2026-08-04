import { makePost } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { describe, expect, it } from 'vitest'

import CategoryListRoute from '@/routes/public/category/list'

describe('snapshot: routes/public/category/list', () => {
  it('renders the category listing route', () => {
    const Route = asRoute(CategoryListRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            title: 'general',
            description: 'General category',
            resolvedPosts: [
              { ...makePost({ slug: 'cat-post', title: 'Cat Post' }), meta: { likes: 0, views: 0, comments: 0 } },
            ],
            pageNum: 1,
            totalPage: 1,
            rootPath: '/cats/general',
            listingNowIso: '2026-04-25T12:00:00.000Z',
            seo: undefined,
            extra: undefined,
          }}
        />,
        '/cats/general',
      ),
    )
    expect(html).toContain('general')
    expect(html).toContain('Cat Post')
  })
})
