import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, Outlet, RouterProvider, useOutletContext } from 'react-router'
import { describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { asRoute } from '#/_helpers/route-test-utils'
import SettingsLayoutRoute, { type SettingsOutletContext } from '@/routes/admin/settings/layout'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { ThemeProvider } from '@/ui/lib/ThemeProvider'

// The settings layout's loader transitively pulls in the DB bootstrap — irrelevant to these snapshots.
const CURRENT_USER = { id: '1', name: 'Alice', email: 'alice@example.com' }

const MASKS = {
  assetsSecretAccessKeyMask: '',
  mailApiKeyMask: '',
  mailSmtpPassMask: '',
  mailMailgunApiKeyMask: '',
}

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
})

function renderNested(
  initialPath: string,
  layers: { parent: Record<string, unknown>; middle?: ReactNode; child?: ReactNode },
): string {
  const childRoute: RouteObject = { path: '*', element: layers.child ?? <></> }
  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Outlet context={layers.parent} />,
      children: layers.middle ? [{ path: '/', element: layers.middle, children: [childRoute] }] : [childRoute],
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

function SettingsContextProbe() {
  const ctx = useOutletContext<SettingsOutletContext>()
  return <div data-testid="probe">{ctx.bundle.siteIdentity.title}</div>
}

describe('snapshot: routes/admin/settings/layout', () => {
  it('forwards settings outlet context to children', () => {
    const Layout = asRoute(SettingsLayoutRoute)
    const html = renderNested('/admin/settings', {
      parent: { currentUser: CURRENT_USER },
      middle: (
        <Layout
          loaderData={{
            bundle: TEST_BLOG_SETTINGS_BUNDLE,
            timeZones: ['Asia/Shanghai', 'UTC'],
            masks: MASKS,
          }}
        />
      ),
      child: <SettingsContextProbe />,
    })
    expect(html).toContain('且听书吟')
  })
})
