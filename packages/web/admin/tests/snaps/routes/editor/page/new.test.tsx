import PageNewRoute from '@kobato/web-admin/routes/editor/page/new'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/editor/page/new', () => {
  it('renders the new page editor route', () => {
    const html = stableHtml(renderInRouter(<PageNewRoute />, '/editor/page/new'))
    expect(html).toContain('新页面正文仅本地保留')
    expect(html).toContain('创建页面')
    expect(html).toContain('aria-label="页面标题"')
  })
})
