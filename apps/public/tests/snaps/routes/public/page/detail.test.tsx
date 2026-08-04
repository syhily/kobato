import { makePage } from '#/_helpers/catalog'
import { lexParagraphBody } from '#/_helpers/lexical-body'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { toDetailPageShell } from '@kobato/shared/types/catalog'
import { describe, expect, it } from 'vitest'

import PageDetailRoute from '@/routes/public/page/detail'

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
            body: lexParagraphBody('About body'),
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
            imageMeta: {},
            musicMeta: {},
            footnotesSectionTitle: '尾声礼记',
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
            body: lexParagraphBody('Links body'),
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
            imageMeta: {},
            musicMeta: {},
            footnotesSectionTitle: '尾声礼记',
          }}
        />,
        '/links',
      ),
    )
    expect(html).toContain('左邻右舍')
    expect(html).toContain('Alice')
    // The apply affordance is a button; the form (and its honeypot) stays
    // inside the dialog.
    expect(html).toContain('申请友链')
    expect(html).not.toContain('name="contact"')
  })
})
