import { makeCategory } from '@kobato/test/catalog.ts'
import { renderInRouter, stableHtml } from '@kobato/test/render.tsx'
import { asRoute } from '@kobato/test/route-test-utils.tsx'
import { describe, expect, it } from 'vitest'

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
