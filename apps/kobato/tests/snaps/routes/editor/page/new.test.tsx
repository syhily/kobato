import { renderInRouter, stableHtml } from '@kobato/web-client/tests/utils/render'
import { describe, expect, it } from 'vitest'

import PageNewRoute from '@/routes/editor/page/new'

describe('snapshot: routes/editor/page/new', () => {
  it('renders the new page editor route', () => {
    const html = stableHtml(renderInRouter(<PageNewRoute />, '/editor/page/new'))
    expect(html).toContain('新页面正文仅本地保留')
    expect(html).toContain('创建页面')
    expect(html).toContain('aria-label="页面标题"')
  })
})
