import { toDetailPageShell } from '@kobato/catalog/catalog.ts'
import { makePage } from '@kobato/test/catalog.ts'
import { renderInRouter, stableHtml } from '@kobato/test/render.tsx'
import { asRoute } from '@kobato/test/route-test-utils.tsx'
import { describe, expect, it } from 'vitest'

import PageDetailRoute from '@/routes/public/page/detail.tsx'

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
            bodyHtml: '<p>About body</p>',
            friends: [],
            showFriends: false,
            draftMarker: null,
            detail: {
              admin: false,
              likes: 0,
              commentKey: 'https://example.com/about/',
              comments: Promise.resolve({ commentData: null, commentItems: [] }),
              webmentions: Promise.resolve([]),
              recentComments: [],
              currentUser: null,
            },
          }}
        />,
        '/about',
      ),
    )
    expect(html).toContain('About')
    expect(html).toContain('About body')
  })

  it('renders the friend grid and the application form when showFriends is on', () => {
    const Route = asRoute(PageDetailRoute)
    const page = toDetailPageShell(
      makePage({
        slug: 'links',
        title: 'Links',
        permalink: '/links',
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
            bodyHtml: '<p>Links body</p>',
            friends: [
              {
                website: 'Alice',
                description: 'Alice writes about code.',
                homepage: 'https://alice.example',
                poster: '/images/alice-poster.png',
              },
            ],
            showFriends: true,
            draftMarker: null,
            detail: {
              admin: false,
              likes: 0,
              commentKey: 'https://example.com/links/',
              comments: Promise.resolve({ commentData: null, commentItems: [] }),
              webmentions: Promise.resolve([]),
              recentComments: [],
              currentUser: null,
            },
          }}
        />,
        '/links',
      ),
    )
    expect(html).toContain('左邻右舍')
    expect(html).toContain('Alice')
    // Apply affordance is a button; the form (with honeypot) stays inside the dialog.
    expect(html).toContain('申请友链')
    expect(html).not.toContain('name="contact"')
  })
})
