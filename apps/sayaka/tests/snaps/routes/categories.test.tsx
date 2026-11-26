import { makeCategory } from '@kobato/api/tests/utils/catalog'
import { asRoute } from '@kobato/test/route-test-utils'
import { renderInRouter, stableHtml } from '@kobato/web-kit/tests/utils/render'
import CategoriesRoute from '@sayaka/routes/categories'
import { describe, expect, it } from 'vitest'

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
