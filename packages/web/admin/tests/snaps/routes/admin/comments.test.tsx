import CommentsRoute from '@kobato/web-admin/routes/admin/comments'
import { renderInRouterWithOutlet } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

const CURRENT_USER = { id: '1', name: 'Alice', email: 'alice@example.com' }

describe('snapshot: routes/admin/comments', () => {
  it('renders the comments route with outlet context', () => {
    const html = renderInRouterWithOutlet(<CommentsRoute />, '/admin/comments', { currentUser: CURRENT_USER })
    expect(html).toContain('评论管理')
    expect(html).toContain('审核、回复、编辑站点评论。')
  })
})
