import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render'
import { describe, expect, it } from 'vitest'

import PostNewRoute from '@/routes/editor/post/new'

describe('snapshot: routes/editor/post/new', () => {
  it('renders the new post editor route', () => {
    const html = stableHtml(renderInRouter(<PostNewRoute />, '/editor/post/new'))
    expect(html).toContain('新文章正文仅本地保留')
    expect(html).toContain('创建文章')
    expect(html).toContain('aria-label="文章标题"')
  })
})
