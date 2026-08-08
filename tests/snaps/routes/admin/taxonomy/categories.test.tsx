import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import CategoriesRoute from '@/routes/admin/taxonomy/categories'

describe('snapshot: routes/admin/taxonomy/categories', () => {
  it('renders the categories route', () => {
    const html = stableHtml(renderInRouter(<CategoriesRoute />, '/admin/taxonomy/categories'))
    // List-page chrome — fails if SSR degrades into an error boundary.
    expect(html).toContain('分类管理')
    expect(html).toContain('新增分类')
  })
})
