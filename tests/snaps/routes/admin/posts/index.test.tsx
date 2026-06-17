import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import PostsRoute from '@/routes/admin/posts/index'

describe('snapshot: routes/admin/posts/index', () => {
  it('renders the posts index route', () => {
    const html = stableHtml(renderInRouter(<PostsRoute />, '/admin/posts'))
    expect(html.length).toBeGreaterThan(0)
  })
})
