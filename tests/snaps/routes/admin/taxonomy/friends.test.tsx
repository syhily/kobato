import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import FriendsRoute from '@/routes/admin/taxonomy/friends'

describe('snapshot: routes/admin/taxonomy/friends', () => {
  it('renders the friends route', () => {
    const html = stableHtml(renderInRouter(<FriendsRoute />, '/admin/taxonomy/friends'))
    expect(html.length).toBeGreaterThan(0)
  })
})
