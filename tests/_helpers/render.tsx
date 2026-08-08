import type { ReactElement, ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Buffer } from 'node:buffer'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { prerenderToNodeStream } from 'react-dom/static'
import { createMemoryRouter, Outlet, type RouteObject, RouterProvider } from 'react-router'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false },
  },
})

// Tiny SSR helpers shared across snapshot tests — pick sync vs stream render per spec.

export function renderToHtml(element: ReactElement): string {
  return renderToString(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>{element}</BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

// Render under a memory router (catch-all route) so router hooks resolve;
// BlogSettingsProvider supplies the fixture bundle like production.
export function renderInRouter(node: ReactNode, initialPath: string = '/'): string {
  const routes: RouteObject[] = [{ path: '*', element: <>{node}</> }]
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

/** Like `renderInRouter`, but the tree sits under a parent `<Outlet>`
 *  carrying `outletContext` (for `useOutletContext` consumers). */
export function renderInRouterWithOutlet(node: ReactNode, initialPath: string, outletContext: unknown): string {
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Outlet context={outletContext} />,
      children: [{ path: '*', element: <>{node}</> }],
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

/** Stream-render like the production SSR pipeline and collect the result —
 *  for components depending on Suspense / server-only data fetching. */
export async function prerenderToHtml(element: ReactNode): Promise<string> {
  const { prelude } = await prerenderToNodeStream(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>{element}</BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  const chunks: Buffer[] = []
  for await (const chunk of prelude) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Router-wrapped `prerenderToHtml` — use for lazily-loaded components
 *  (the synchronous helper only renders the boundary's fallback). */
export async function prerenderInRouter(node: ReactNode, initialPath: string = '/'): Promise<string> {
  const routes: RouteObject[] = [{ path: '*', element: <>{node}</> }]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  const { prelude } = await prerenderToNodeStream(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <RouterProvider router={router} />
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  const chunks: Buffer[] = []
  for await (const chunk of prelude) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Strip volatile React server attributes / hydration markers so snapshots
 *  survive React minor upgrades. Regex-based, no DOM rebuild. */
export function stableHtml(html: string): string {
  return (
    html
      .replace(/\s+data-react[\w-]+="[^"]*"/g, '')
      .replace(/<!--\$-->|<!--\/\$-->|<!--\$\?-->|<!--\$!-->|<!---->/g, '')
      // Base UI emits volatile useId-based ids — normalize them.
      .replace(/id="base-ui-[^"]*"/g, 'id="base-ui-id"')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}
