import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { describe, expect, it } from 'vitest'

import ArchivesRoute from '@/routes/public/archives'

describe('snapshot: routes/public/archives', () => {
  it('renders the archives route with resolved posts', () => {
    const Route = asRoute(ArchivesRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            resolvedPosts: [],
            listingNowIso: '2026-04-25T12:00:00.000Z',
          }}
        />,
        '/archives',
      ),
    )
    expect(html).toContain('共 0 篇文章')
  })
})
