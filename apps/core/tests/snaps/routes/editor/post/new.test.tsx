import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { describe, expect, it } from 'vitest'

import PostNewRoute from '@/routes/editor/post/new'

describe('snapshot: routes/editor/post/new', () => {
  it('renders the new post editor route', () => {
    const Route = asRoute(PostNewRoute)
    const html = stableHtml(renderInRouter(<Route loaderData={null} />, '/editor/post/new'))
    // Create-mode chrome: the local-draft banner, the toolbar create button,
    // and the title strip. These fail if SSR degrades into an error boundary.
    expect(html).toContain('新文章正文仅本地保留')
    expect(html).toContain('创建文章')
    expect(html).toContain('aria-label="文章标题"')
  })
})
