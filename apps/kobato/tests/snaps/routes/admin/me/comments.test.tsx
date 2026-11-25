import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'

import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { asRoute } from '@kobato/test/route-test-utils'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { BlogSettingsProvider } from '@kobato/web-public/ui/lib/blog-settings-context'
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
          <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
            <RouterProvider router={router} />
          </I18nProvider>
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
