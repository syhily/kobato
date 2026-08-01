import { describe, expect, it } from 'vitest'

import { renderInRouterWithOutlet } from '#/_helpers/render'
import CommentsRoute from '@/routes/admin/comments'

const CURRENT_USER = { id: '1', name: 'Alice', email: 'alice@example.com' }

describe('snapshot: routes/admin/comments', () => {
  it('renders the comments route with outlet context', () => {
    const html = renderInRouterWithOutlet(<CommentsRoute />, '/admin/comments', { currentUser: CURRENT_USER })
    expect(html).toContain('评论管理')
    expect(html).toContain('审核、回复、编辑站点评论。')
  })
})
