import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render.tsx'
import { describe, expect, it } from 'vitest'

import PostsRoute from '@/routes/admin/posts/index.tsx'

describe('snapshot: routes/admin/posts/index', () => {
  it('renders the posts index route', () => {
    const html = stableHtml(renderInRouter(<PostsRoute />, '/admin/posts'))
    expect(html).toContain('文章管理')
    expect(html).toContain('新建文章')
  })
})
