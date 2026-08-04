import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'

import { describe, expect, it } from 'vitest'

import PageNewRoute from '@/routes/editor/page/new'

describe('snapshot: routes/editor/page/new', () => {
  it('renders the new page editor route', () => {
    const Route = asRoute(PageNewRoute)
    const html = stableHtml(renderInRouter(<Route loaderData={null} />, '/editor/page/new'))
    // Create-mode chrome: the local-draft banner, the toolbar create button,
    // and the title strip. These fail if SSR degrades into an error boundary.
    expect(html).toContain('新页面正文仅本地保留')
    expect(html).toContain('创建页面')
    expect(html).toContain('aria-label="页面标题"')
  })
})
