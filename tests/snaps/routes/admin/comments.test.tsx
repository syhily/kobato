import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import CommentsRoute from '@/routes/admin/comments'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'

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

describe('snapshot: routes/admin/comments', () => {
  it('renders the comments route with outlet context', () => {
    const html = renderWithOutlet(<CommentsRoute />, '/admin/comments')
    expect(html.length).toBeGreaterThan(0)
  })
})
