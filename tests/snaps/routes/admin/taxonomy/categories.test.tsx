import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import CategoriesRoute from '@/routes/admin/taxonomy/categories'

describe('snapshot: routes/admin/taxonomy/categories', () => {
  it('renders the categories route', () => {
    const html = stableHtml(renderInRouter(<CategoriesRoute />, '/admin/taxonomy/categories'))
    expect(html.length).toBeGreaterThan(0)
  })
})
