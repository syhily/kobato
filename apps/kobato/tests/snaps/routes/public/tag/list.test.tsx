import { makePost } from '@kobato/api/tests/utils/catalog'
import { asRoute } from '@kobato/test/route-test-utils'
import { renderInRouter, stableHtml } from '@kobato/web-public/tests/utils/render'
import { describe, expect, it } from 'vitest'

import TagListRoute from '@/routes/public/tag/list'

describe('snapshot: routes/public/tag/list', () => {
  it('renders the tag listing route', () => {
    const Route = asRoute(TagListRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            title: 'typescript',
            resolvedPosts: [
              { ...makePost({ slug: 'ts-post', title: 'TS Post' }), meta: { likes: 0, views: 0, comments: 0 } },
            ],
            pageNum: 1,
            totalPage: 1,
            rootPath: '/tags/typescript',
            listingNowIso: '2026-04-25T12:00:00.000Z',
            seo: undefined,
            extra: undefined,
          }}
        />,
        '/tags/typescript',
      ),
    )
    expect(html).toContain('typescript')
    expect(html).toContain('TS Post')
  })
})
