import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { asRoute } from '#/_helpers/route-test-utils'

import { BlogSettingsProvider } from '@kobato/shared/lib/blog-config-context'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import MyCommentsRoute from '@/routes/admin/me/comments'

const CURRENT_USER = { id: '1', name: 'Alice', email: 'alice@example.com' }

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
})

function renderWithOutlet(node: ReactNode, initialPath: string): string {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Outlet context={{ currentUser: CURRENT_USER }} />,
      children: [{ path: '*', element: node }],
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  return renderToStaticMarkup(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <RouterProvider router={router} />
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('snapshot: routes/admin/me/comments', () => {
  it('renders the my comments route with outlet context', () => {
    const Route = asRoute(MyCommentsRoute)
    const html = renderWithOutlet(
      <Route loaderData={{ status: 'all', q: '', entity: null, entityOptions: [] }} />,
      '/admin/me/comments',
    )
    expect(html).toContain('我的评论')
    expect(html).toContain('条评论')
  })
})
