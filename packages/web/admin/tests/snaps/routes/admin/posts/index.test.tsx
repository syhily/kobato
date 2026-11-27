import PostsRoute from '@kobato/web-admin/routes/admin/posts/index'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/admin/posts/index', () => {
  it('renders the posts index route', () => {
    const html = stableHtml(renderInRouter(<PostsRoute />, '/admin/posts'))
    expect(html).toContain('文章管理')
    expect(html).toContain('新建文章')
  })
})
