import { renderInRouter, stableHtml } from '#/_helpers/render'

import { describe, expect, it } from 'vitest'

import PagesRoute from '@/routes/admin/pages/index'

describe('snapshot: routes/admin/pages/index', () => {
  it('renders the pages index route', () => {
    const html = stableHtml(renderInRouter(<PagesRoute />, '/admin/pages'))
    expect(html).toContain('页面管理')
    expect(html).toContain('新建页面')
  })
})
