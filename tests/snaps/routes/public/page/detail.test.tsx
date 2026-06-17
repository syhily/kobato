import { describe, expect, it } from 'vitest'

import { makePage } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import PageDetailRoute from '@/routes/public/page/detail'
import { toDetailPageShell } from '@/shared/types/catalog'

describe('snapshot: routes/public/page/detail', () => {
  it('renders the page detail route', () => {
    const Route = asRoute(PageDetailRoute)
    const page = toDetailPageShell(
      makePage({
        slug: 'about',
        title: 'About',
        permalink: '/about',
        date: new Date('2024-01-01T00:00:00.000Z'),
        toc: false,
        comments: false,
      }),
    )
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            page,
            body: [{ _type: 'block', children: [{ _type: 'span', _key: 's1', text: 'About body' }] }],
            friends: [],
            showFriends: false,
            draftMarker: null,
            detail: {
              admin: false,
              likes: 0,
              commentKey: 'https://example.com/about/',
              comments: Promise.resolve({ commentData: null, commentItems: [] }),
              recentComments: [],
              currentUser: null,
            },
            imageMeta: {},
            footnotesSectionTitle: '尾声礼记',
          }}
        />,
        '/about',
      ),
    )
    expect(html).toContain('About')
    expect(html).toContain('About body')
  })
})
