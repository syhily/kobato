import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import MusicDetailRoute from '@/routes/admin/library/music/detail'

describe('snapshot: routes/admin/library/music/detail', () => {
  it('renders the music detail route', () => {
    const Route = asRoute(MusicDetailRoute)
    const html = stableHtml(
      renderInRouter(<Route loaderData={{ id: 'abc' }} params={{ id: 'abc' }} />, '/admin/library/music/abc'),
    )
    expect(html.length).toBeGreaterThan(0)
  })
})
