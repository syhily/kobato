import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import PageNewRoute from '@/routes/editor/page/new'

describe('snapshot: routes/editor/page/new', () => {
  it('renders the new page editor route', () => {
    const html = stableHtml(renderInRouter(<PageNewRoute />, '/editor/page/new'))
    // Create-mode chrome — fails if SSR degrades into an error boundary.
    expect(html).toContain('新页面正文仅本地保留')
    expect(html).toContain('创建页面')
    expect(html).toContain('aria-label="页面标题"')
  })
})
