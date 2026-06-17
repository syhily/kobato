import { describe, expect, it } from 'vitest'

import { makeCategory } from '#/_helpers/catalog'
import { renderInRouter, stableHtml } from '#/_helpers/render'
import { asRoute } from '#/_helpers/route-test-utils'
import CategoriesRoute from '@/routes/public/categories'

describe('snapshot: routes/public/categories', () => {
  it('renders the categories route', () => {
    const Route = asRoute(CategoriesRoute)
    const html = stableHtml(
      renderInRouter(
        <Route
          loaderData={{
            categories: [makeCategory({ name: 'general', slug: 'general' })],
          }}
        />,
        '/categories',
      ),
    )
    expect(html).toContain('分类')
  })
})
