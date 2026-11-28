import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

import CategoriesRoute from '@/routes/admin/taxonomy/categories'

describe('snapshot: routes/admin/taxonomy/categories', () => {
  it('renders the categories route', () => {
    const html = stableHtml(renderInRouter(<CategoriesRoute />, '/admin/taxonomy/categories'))
    expect(html).toContain('分类管理')
    expect(html).toContain('新增分类')
  })
})
