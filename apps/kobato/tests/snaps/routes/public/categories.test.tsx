import { asRoute } from '@kobato/test/route-test-utils.tsx'
import { makeCategory } from '@tests/utils/catalog.ts'
import { renderInRouter, stableHtml } from '@tests/utils/render.tsx'
import { describe, expect, it } from 'vitest'

import CategoriesRoute from '@/routes/public/categories.tsx'

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
