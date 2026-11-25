import type { AppLocale } from '@kobato/i18n/locales'

import { DEFAULT_LOCALE } from '@kobato/i18n/locales'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW'
import { requestContext } from '@kobato/server/http/request-context'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, Outlet, type RouteObject, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/route-warmup/compiled-script', () => ({ default: '' }))
vi.mock('@/route-warmup/RouteWarmupScript', () => ({ RouteWarmupScript: () => null }))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    Meta: () => null,
    Links: () => null,
    Scripts: () => null,
    ScrollRestoration: () => null,
  }
})

const { Layout } = await import('@/root')
const { default: handleRequest } = await import('@/entry.server')

function documentHtml(rootLoaderData: unknown): string {
  const routes: RouteObject[] = [
    {
      id: 'root',
      Component: () => (
        <Layout>
          <Outlet />
        </Layout>
      ),
      children: [{ path: '/', Component: () => <div /> }],
    },
  ]
  const router = createMemoryRouter(routes, {
    initialEntries: ['/'],
    ...(rootLoaderData === undefined ? {} : { hydrationData: { loaderData: { root: rootLoaderData } } }),
  })
  return renderToStaticMarkup(<RouterProvider router={router} />)
}

function renderedLang(rootLoaderData: unknown): string {
  const match = /<html[^>]*\blang="([^"]+)"/.exec(documentHtml(rootLoaderData))
  expect(match?.[1]).toBeTruthy()
  return match![1]!
}

function responseLocale(rootLoaderData: unknown, requestLocale: AppLocale): string | null {
  const headers = new Headers()
  const loadContext = {
    get: (context: unknown) =>
      context === requestContext
        ? makeRequestContext({
            localization: {
              locale: requestLocale,
              timeZone: 'UTC',
              timeFormat: null,
              revision: 'boot-test:0000000000',
            },
          })
        : undefined,
  }
  handleRequest(
    new Request('http://localhost/', { method: 'HEAD' }),
    200,
    headers,
    {
      staticHandlerContext: {
        loaderData: rootLoaderData === undefined ? {} : { root: rootLoaderData },
        actionData: null,
        errors: null,
        statusCode: 200,
        location: { pathname: '/' },
        matches: [],
      },
      manifest: {},
      routeModules: {},
      criticalCss: null,
      serverHandoffString: '{}',
      serverHandoffStream: null,
      renderMeta: {},
      future: {},
      ssr: true,
      routeDiscovery: { mode: 'initial' },
      isSpaMode: false,
      serializeError: (err: unknown) => err,
    } as never,
    loadContext as never,
  )
  return headers.get('Content-Language')
}

const rootData = { blogSettings: TEST_BLOG_SETTINGS_BUNDLE, i18n: { locale: 'zh-TW', messages: uiMessagesZhTW } }

describe('document Content-Language ⇔ <html lang>', () => {
  it('agrees with the rendered document on a successful root loader', () => {
    expect(renderedLang(rootData)).toBe('zh-TW')
    expect(responseLocale(rootData, 'zh-TW')).toBe(renderedLang(rootData))
  })

  it('agrees with the Layout fallback when the root loader failed', () => {
    expect(renderedLang(undefined)).toBe(DEFAULT_LOCALE)
    expect(responseLocale(undefined, 'en-US')).toBe(DEFAULT_LOCALE)
  })

  it('keeps a normal-path header equal to the request locale when the payload carries it', () => {
    const enData = { blogSettings: TEST_BLOG_SETTINGS_BUNDLE, i18n: { locale: 'en-US', messages: uiMessagesEnUS } }
    expect(renderedLang(enData)).toBe('en-US')
    expect(responseLocale(enData, 'en-US')).toBe('en-US')
  })
})
