import type { AppLocale } from '@kobato/i18n/locales'
import type { ReactElement, ReactNode } from 'react'

import { uiMessagesFor } from '@kobato/i18n/catalog'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider'
import { BlogSettingsProvider } from '@kobato/web-client/settings/blog-settings-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Buffer } from 'node:buffer'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { prerenderToNodeStream } from 'react-dom/static'
import { createMemoryRouter, Outlet, type RouteObject, RouterProvider } from 'react-router'

export const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false },
  },
})

export function renderToHtml(element: ReactElement): string {
  return renderToString(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
            {element}
          </I18nProvider>
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

export function renderInRouter(
  node: ReactNode,
  initialPath: string = '/',
  options: { locale?: AppLocale } = {},
): string {
  const locale = options.locale ?? 'zh-CN'
  const routes: RouteObject[] = [{ path: '*', element: <>{node}</> }]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  return renderToStaticMarkup(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <I18nProvider locale={locale} messages={locale === 'zh-CN' ? uiMessagesZhCN : uiMessagesFor(locale)}>
            <RouterProvider router={router} />
          </I18nProvider>
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

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
          <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
            <RouterProvider router={router} />
          </I18nProvider>
        </BlogSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

export async function prerenderToHtml(element: ReactNode): Promise<string> {
  const { prelude } = await prerenderToNodeStream(
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider>
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
            {element}
          </I18nProvider>
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

export async function prerenderInRouter(node: ReactNode, initialPath: string = '/'): Promise<string> {
  const routes: RouteObject[] = [{ path: '*', element: <>{node}</> }]
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  const { prelude } = await prerenderToNodeStream(
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
  const chunks: Buffer[] = []
  for await (const chunk of prelude) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function stableHtml(html: string): string {
  return html
    .replace(/\s+data-react[\w-]+="[^"]*"/g, '')
    .replace(/<!--\$-->|<!--\/\$-->|<!--\$\?-->|<!--\$!-->|<!---->/g, '')
    .replace(/id="base-ui-[^"]*"/g, 'id="base-ui-id"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
