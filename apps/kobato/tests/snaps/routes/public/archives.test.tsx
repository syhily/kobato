import { asRoute } from '@kobato/test/route-test-utils.tsx'
import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render.tsx'
import { describe, expect, it } from 'vitest'

import ArchivesRoute from '@/routes/public/archives.tsx'

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
