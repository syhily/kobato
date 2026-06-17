import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { asRoute } from '#/_helpers/route-test-utils'
import PublicLayoutRoute, { ErrorBoundary } from '@/routes/public/layout'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
})

function renderRoutes(routes: RouteObject[], initialPath: string): string {
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
    const html = renderRoutes(
      [
        {
          path: '/',
          element: <Boundary error={new Response('Not found', { status: 404 })} />,
        },
      ],
      '/',
    )
    expect(html.length).toBeGreaterThan(0)
    expect(html).toContain('且听书吟')
  })
})
