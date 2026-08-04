import { renderInRouter, stableHtml } from '#/_helpers/render'

import { describe, expect, it } from 'vitest'

import FriendsRoute from '@/routes/admin/taxonomy/friends'

describe('snapshot: routes/admin/taxonomy/friends', () => {
  it('renders the friends route', () => {
    const html = stableHtml(renderInRouter(<FriendsRoute />, '/admin/taxonomy/friends'))
    // List-page chrome: heading, search box, and the create button. These
    // fail if SSR degrades into an error boundary.
    expect(html).toContain('友链管理')
    expect(html).toContain('aria-label="搜索友链"')
    expect(html).toContain('新增友链')
  })
})
