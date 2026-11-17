import type { RouteObject } from 'react-router'

import { uiMessagesZhCN } from '@kobato/shared/i18n/messages/ui/zh-CN.ts'
import { BlogSettingsProvider } from '@kobato/shared/lib/blog-config-context.tsx'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { asRoute } from '@kobato/test/route-test-utils.tsx'
import { I18nProvider } from '@kobato/web/ui/lib/I18nProvider.tsx'
import { ThemeProvider } from '@kobato/web/ui/lib/ThemeProvider.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import PublicLayoutRoute, { ErrorBoundary } from '@/routes/public/layout'

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
})

function renderRoutes(routes: RouteObject[], initialPath: string): string {
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

describe('snapshot: routes/public/layout', () => {
  it('renders the public layout around an outlet child', () => {
    const Layout = asRoute(PublicLayoutRoute)
    const html = renderRoutes(
      [
        {
          path: '/',
          element: <Layout loaderData={{}} />,
          children: [{ index: true, element: <span>child content</span> }],
        },
      ],
      '/',
    )
    expect(html).toContain('且听书吟')
    expect(html).toContain('child content')
  })

  it('renders the error boundary inside the chrome', () => {
    const Boundary = asRoute(ErrorBoundary)
    // isRouteErrorResponse needs internal/data — reuse the ErrorView snapshot's 404 shape.
    const notFound = { status: 404, statusText: 'Not Found', internal: false, data: null }
    const html = renderRoutes(
      [
        {
          path: '/',
          element: <Boundary error={notFound} />,
        },
      ],
      '/',
    )
    // The ErrorView 404 branch renders its hero and description inside the
    // site chrome.
    expect(html).toContain('404')
    expect(html).toContain('抱歉，没有你要找的内容')
    expect(html).toContain('且听书吟')
  })
})
