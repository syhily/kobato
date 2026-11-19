// @vitest-environment jsdom
import type { ReactNode } from 'react'

import { fallbackMessages } from '@kobato/i18n/fallback-messages.ts'
import { DEFAULT_LOCALE } from '@kobato/i18n/locales.ts'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US.ts'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN.ts'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { prerenderToHtml } from '@kobato/test/render.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { formatLocalDate } from '@kobato/utils/site-date.ts'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { createMemoryRouter, Outlet, type RouteObject, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary, Layout, shouldRevalidate } from '@/root.tsx'

// Virtual module from the route-warmup Vite plugin — unresolvable in the unit runner.
vi.mock('virtual:route-warmup-script', () => ({ default: '' }))
vi.mock('@kobato/web-client/route-warmup/RouteWarmupScript.tsx', () => ({ RouteWarmupScript: () => null }))

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
    expect(html).toContain(fallbackMessages['common.action.reload'])
    expect(html).toContain('2024-06-01 08:00')
  })
})

describe('root i18n — jsdom hydration', () => {
  function tree(rootLoaderData: unknown) {
    return <RouterProvider router={makeRouter(rootLoaderData)} />
  }

  function hydrateDocument(
    rootLoaderData: unknown,
    element?: ReactNode,
    clientTree?: () => ReactNode,
  ): ReturnType<typeof vi.fn> {
    const serverTree = <RouterProvider router={makeRouter(rootLoaderData, element)} />
    const serverHtml = renderToString(serverTree)
    const openTag = /^<html([^>]*)>/i.exec(serverHtml)?.[1] ?? ''
    document.documentElement.innerHTML = serverHtml.slice(serverHtml.indexOf('>') + 1)

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

    expect(html).toContain('boom')
    expect(html).toContain('Skip to main content')
  })
})
describe('root shouldRevalidate — payload scope boundary', () => {
  function args(currentPath: string, nextPath: string, formAction?: string, defaultShouldRevalidate = false) {
    return {
      currentUrl: new URL(`http://localhost${currentPath}`),
      nextUrl: new URL(`http://localhost${nextPath}`),
      formAction,
      defaultShouldRevalidate,
    } as unknown as Parameters<typeof shouldRevalidate>[0]
  }

  it('revalidates when a navigation crosses public ↔ workspace', () => {
    expect(shouldRevalidate(args('/', '/admin/settings'))).toBe(true)
    expect(shouldRevalidate(args('/posts/hello', '/editor/post/new'))).toBe(true)

    expect(shouldRevalidate(args('/admin/settings', '/'))).toBe(true)
    expect(shouldRevalidate(args('/admin/signin', '/posts/hello'))).toBe(true)
  })

  it('keeps the payload for same-scope navigation', () => {
    expect(shouldRevalidate(args('/', '/posts/hello'))).toBe(false)
    expect(shouldRevalidate(args('/posts/hello', '/tags/react'))).toBe(false)
    expect(shouldRevalidate(args('/admin/settings', '/admin/posts'))).toBe(false)
    expect(shouldRevalidate(args('/editor/post/new', '/editor/page/new'))).toBe(false)
  })

  it('always defers to the default policy for form actions', () => {
    expect(shouldRevalidate(args('/', '/', '/admin/signin', true))).toBe(true)
    expect(shouldRevalidate(args('/admin/settings', '/admin/settings', '/admin/settings/general', true))).toBe(true)
    expect(shouldRevalidate(args('/', '/', '/signout', true))).toBe(true)

    expect(shouldRevalidate(args('/', '/', '/signout', false))).toBe(false)
  })
})
