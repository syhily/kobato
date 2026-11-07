// @vitest-environment jsdom
/**
 * Root SSR/i18n contract (plan 001, Step 2):
 *  · the root Layout feeds the loader's i18n payload to ONE react-intl provider
 *    and stamps `<html lang>` from it;
 *  · a real `renderToString` → `hydrateRoot` round-trip with identical
 *    locale/messages/now produces no hydration mismatch (and the control case
 *    proves the assertion can fail);
 *  · a root-loader failure (no i18n payload) renders the minimal ErrorView over
 *    the synchronous fallback — never the BaseLayout chrome.
 */
import type { ReactNode } from 'react'

import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { createMemoryRouter, Outlet, type RouteObject, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { prerenderToHtml } from '#/_helpers/render'
import { ErrorBoundary, Layout } from '@/root'
import { fallbackMessages } from '@/shared/i18n/fallback-messages'
import { DEFAULT_LOCALE } from '@/shared/i18n/locales'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { uiMessagesZhTW } from '@/shared/i18n/messages/ui/zh-TW'
import { formatLocalDate } from '@/shared/utils/formatter'
import { useI18n } from '@/ui/lib/I18nProvider'

// Virtual module from the route-warmup Vite plugin — unresolvable in the unit runner.
vi.mock('virtual:route-warmup-script', () => ({ default: '' }))
// Under the jsdom/web transform pipeline the virtual specifier is resolved too
// late — stub the component that owns the import as well.
vi.mock('@/client/components/RouteWarmupScript', () => ({ RouteWarmupScript: () => null }))

// Meta/Links/Scripts/ScrollRestoration need the framework build manifest a
// memory router lacks — stub them, keep the rest real.
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

const NOW_ISO = '2024-06-01T00:00:00.000Z'
const TIME_ZONE = 'Asia/Shanghai'
const TIME_FORMAT = 'yyyy-LL-dd HH:mm'

/** Mirrors a public route: it reads the provider only, no props. */
function I18nProbe() {
  const { locale, t } = useI18n()
  return (
    <div data-testid="probe">
      <span data-testid="probe-locale">{locale}</span>
      <span data-testid="probe-save">{t('common.action.save')}</span>
      <span data-testid="probe-count">{t('common.count.items', { count: 2 })}</span>
      <span data-testid="probe-reload">{t('common.action.reload')}</span>
      <span data-testid="probe-now">
        {formatLocalDate(new Date(NOW_ISO), undefined, { locale, timeZone: TIME_ZONE, timeFormat: TIME_FORMAT })}
      </span>
    </div>
  )
}

/** Renders only keys the minimal fallback module carries (no missing-key noise). */
function FallbackProbe() {
  const { locale, t } = useI18n()
  return (
    <div data-testid="probe">
      <span data-testid="probe-locale">{locale}</span>
      <span data-testid="probe-reload">{t('common.action.reload')}</span>
      <span data-testid="probe-now">
        {formatLocalDate(new Date(NOW_ISO), undefined, { locale, timeZone: TIME_ZONE, timeFormat: TIME_FORMAT })}
      </span>
    </div>
  )
}

function rootDataFor(locale: 'zh-CN' | 'zh-TW' | 'en-US', messages: Record<string, string>) {
  return {
    theme: null,
    fonts: null,
    blogSettings: TEST_BLOG_SETTINGS_BUNDLE,
    criticalLinks: [],
    tier2Chunks: [],
    csrfToken: 'csrf',
    cspNonce: 'nonce',
    i18n: { locale, messages },
  }
}

/** Root Layout + one child route; `rootLoaderData` undefined simulates a root-loader failure. */
function makeRoutes(rootLoaderData: unknown, element: ReactNode = <I18nProbe />): RouteObject[] {
  return [
    {
      id: 'root',
      Component: () => (
        <Layout>
          <Outlet />
        </Layout>
      ),
      children: [{ path: '/', Component: () => <>{element}</> }],
    },
  ]
}

function makeRouter(rootLoaderData: unknown, element?: ReactNode) {
  return createMemoryRouter(makeRoutes(rootLoaderData, element), {
    initialEntries: ['/'],
    ...(rootLoaderData === undefined ? {} : { hydrationData: { loaderData: { root: rootLoaderData } } }),
  })
}

const mounted: HTMLElement[] = []
const roots: Array<{ unmount: () => void }> = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  for (const container of mounted.splice(0)) {
    container.remove()
  }
})

describe('root i18n — Layout → provider → <html lang>', () => {
  it('stamps lang and feeds the loader catalog to children', () => {
    const html = renderToStaticMarkup(<RouterProvider router={makeRouter(rootDataFor('zh-TW', uiMessagesZhTW))} />)

    expect(html).toContain('<html lang="zh-TW"')
    expect(html).toContain('儲存')
    expect(html).toContain('2024-06-01 08:00')
  })

  it('falls back to the default locale and the synchronous fallback messages without a payload', () => {
    const html = renderToStaticMarkup(<RouterProvider router={makeRouter(undefined, <FallbackProbe />)} />)

    expect(html).toContain(`<html lang="${DEFAULT_LOCALE}"`)
    // Only the fallback module's keys resolve without a payload.
    expect(html).toContain(fallbackMessages['common.action.reload'])
    expect(html).toContain('2024-06-01 08:00')
  })
})

describe('root i18n — jsdom hydration', () => {
  function tree(rootLoaderData: unknown) {
    return <RouterProvider router={makeRouter(rootLoaderData)} />
  }

  /**
   * Server-render the document, install it in jsdom, hydrate with
   * `clientTree()`. React reports a mismatch through `onRecoverableError`, so
   * the spy is the assertion surface.
   */
  function hydrateDocument(
    rootLoaderData: unknown,
    element?: ReactNode,
    clientTree?: () => ReactNode,
  ): ReturnType<typeof vi.fn> {
    const serverTree = <RouterProvider router={makeRouter(rootLoaderData, element)} />
    const serverHtml = renderToString(serverTree)
    const openTag = /^<html([^>]*)>/i.exec(serverHtml)?.[1] ?? ''
    document.documentElement.innerHTML = serverHtml.slice(serverHtml.indexOf('>') + 1)
    // `innerHTML` cannot carry the root element's own attributes — copy `lang`
    // (the attribute this contract is about) onto the real <html>.
    const lang = /lang="([^"]*)"/.exec(openTag)?.[1]
    if (lang === undefined) {
      document.documentElement.removeAttribute('lang')
    } else {
      document.documentElement.setAttribute('lang', lang)
    }

    const onRecoverableError = vi.fn()
    let root: ReturnType<typeof hydrateRoot>
    act(() => {
      root = hydrateRoot(document, clientTree?.() ?? serverTree, { onRecoverableError })
    })
    roots.push(root!)
    return onRecoverableError
  }

  it('produces no mismatch when locale, messages and now are identical', () => {
    const onRecoverableError = hydrateDocument(rootDataFor('zh-CN', uiMessagesZhCN))

    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(document.documentElement.getAttribute('lang')).toBe('zh-CN')
    expect(document.querySelector('[data-testid="probe-locale"]')?.textContent).toBe('zh-CN')
    expect(document.querySelector('[data-testid="probe-save"]')?.textContent).toBe('保存')
    expect(document.querySelector('[data-testid="probe-count"]')?.textContent).toBe('2 项')
    // Site time zone, not the browser's: 00:00Z is 08:00 in Asia/Shanghai.
    expect(document.querySelector('[data-testid="probe-now"]')?.textContent).toBe('2024-06-01 08:00')
  })

  it('control: a different locale/messages on the first client render IS reported', () => {
    const onRecoverableError = hydrateDocument(rootDataFor('zh-CN', uiMessagesZhCN), undefined, () =>
      tree(rootDataFor('en-US', uiMessagesEnUS)),
    )

    expect(onRecoverableError).toHaveBeenCalled()
  })

  it('hydrates the fallback boundary identically when no payload exists', () => {
    const onRecoverableError = hydrateDocument(undefined, <FallbackProbe />)

    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(document.documentElement.getAttribute('lang')).toBe(DEFAULT_LOCALE)
    expect(document.querySelector('[data-testid="probe-reload"]')?.textContent).toBe(
      fallbackMessages['common.action.reload'],
    )
  })
})

describe('root ErrorBoundary — loader-failure behavior', () => {
  const boom = () => new Error('boom')

  it('renders only the minimal ErrorView (fallback copy, no BaseLayout chrome) without an i18n payload', async () => {
    // A non-Error keeps the dev branch from replacing the description with a message.
    const html = await prerenderToHtml(
      <RouterProvider
        router={makeRouter(
          undefined,
          <ErrorBoundary error={undefined} loaderData={undefined as never} params={{} as never} />,
        )}
      />,
    )

    expect(html).toContain(fallbackMessages['error.boundary.title'])
    expect(html).toContain(fallbackMessages['error.boundary.description'])
    // BaseLayout chrome (skip link text from the public shell) must not mount.
    expect(html).not.toContain('跳转到主要内容')
    expect(html).not.toContain('Skip to main content')
  })

  it('mounts the full error layout and the loader locale when i18n data exists', async () => {
    const html = await prerenderToHtml(
      <RouterProvider
        router={makeRouter(
          rootDataFor('en-US', uiMessagesEnUS),
          <ErrorBoundary
            error={boom()}
            loaderData={
              { blogSettings: TEST_BLOG_SETTINGS_BUNDLE, i18n: rootDataFor('en-US', uiMessagesEnUS).i18n } as never
            }
            params={{} as never}
          />,
        )}
      />,
    )

    expect(html).toContain('<html lang="en-US"')
    expect(html).toContain('Skip to main content')
    expect(html).toContain('Internal error')
    // Dev mode shows the thrown message instead of the catalog description.
    expect(html).toContain('boom')
    expect(html).toContain('Skip to main content')
  })
})
