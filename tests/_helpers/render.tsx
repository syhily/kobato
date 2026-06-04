import type { ReactElement, ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Buffer } from 'node:buffer'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { prerenderToNodeStream } from 'react-dom/static'
import { createMemoryRouter, type RouteObject, RouterProvider } from 'react-router'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false },
  },
})

// Tiny SSR helpers shared across snapshot tests so each spec doesn't have to
// know whether it should reach for `renderToString` (synchronous, no Suspense
// boundary needed) or `prerenderToNodeStream` (the path the RSS/Atom feed
// pipeline uses when it still needs an HTML string).

/** Synchronously render a React element to an HTML string. */
export function renderToHtml(element: ReactElement): string {
  return renderToString(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>{element}</BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

// Render a component tree under a memory router so React Router 7 hooks
// (`useLocation`, `useHref`, `useFetcher`, `<Link>`, …) can resolve. The
// memory router is configured with a single catch-all route so the snapshot
// matches what the SSR runtime would produce for `initialPath`. The tree is
// also wrapped in a `BlogSettingsProvider` so components calling
// per-section accessors resolve against a stable bundle fixture —
// production renders sit behind the install gate, and tests need the
// same invariant without bringing up the real loader chain.
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

/**
 * Stream-render a React tree the way our production SSR pipeline does, then
 * collect the result into a single string. Useful for snapshot-testing
 * components that depend on Suspense / server-only data fetching. The tree
 * is wrapped in a `BlogSettingsProvider` so consumers reading from any
 * per-section context see the test fixture instead of throwing.
 */
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

/**
 * Strip volatile React server attributes (`data-react-*`, hydration markers,
 * source-map URL fragments) so snapshots survive React minor upgrades.
 * Pure regex-based; does not rebuild the DOM.
 */
export function stableHtml(html: string): string {
  return (
    html
      .replace(/\s+data-react[\w-]+="[^"]*"/g, '')
      .replace(/<!--\$-->|<!--\/\$-->|<!--\$\?-->|<!--\$!-->|<!---->/g, '')
      // Base UI generates volatile ids from React useId — strip them so
      // snapshots stay stable across runs.
      .replace(/id="base-ui-[^"]*"/g, 'id="base-ui-id"')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}
