import PagesRoute from '@kobato/web-admin/routes/admin/pages/index'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: routes/admin/pages/index', () => {
  it('renders the pages index route', () => {
    const html = stableHtml(renderInRouter(<PagesRoute />, '/admin/pages'))
    expect(html).toContain('页面管理')
    expect(html).toContain('新建页面')
  })
})
