// @vitest-environment jsdom
/**
 * `formatShowDate` is RELATIVE ("today" / "yesterday"), so a render-time
 * `new Date()` reads the server clock on the server and the browser clock on
 * the client. A hydration that crosses local midnight therefore renders
 * different copy and React reports a mismatch. The table must
 * read the root loader's `nowIso` during SSR + hydration (the `useChromeClock`
 * pattern) and only advance after mount.
 */
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { makeAdminUser } from '#/_helpers/catalog'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { UsersTable } from '@/ui/admin/users/UsersTable'
import { I18nProvider } from '@/ui/lib/I18nProvider'

const config = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!

// Site zone is Asia/Shanghai (UTC+8). The row was registered on Nov 8 01:00 local.
const CREATED_AT = '2026-11-07T17:00:00.000Z'
// Server render instant: 23:59:00 local, Nov 8 → "today".
const SSR_NOW = '2026-11-08T15:59:00.000Z'
// Browser hydration instant, one minute later: 00:00:30 local, Nov 9 → "yesterday".
const CLIENT_NOW = '2026-11-08T16:00:30.000Z'

const rows = [makeAdminUser({ id: 'user-1', name: 'Alice', createdAt: CREATED_AT })]

function tree(nowIso: string) {
  const routes: RouteObject[] = [
    {
      id: 'root',
      path: '*',
      element: (
        <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
          <UsersTable rows={rows} config={config} isLoading={false} />
        </I18nProvider>
      ),
    },
  ]
  // The loader data the server baked into the document — never re-run on the client.
  return <RouterProvider router={createMemoryRouter(routes, { hydrationData: { loaderData: { root: { nowIso } } } })} />
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
  vi.useRealTimers()
})

beforeEach(() => {
  mounted.push(document.body.appendChild(document.createElement('div')))
})

/** Server-render at `SSR_NOW`, then hydrate in jsdom at `CLIENT_NOW`. */
function ssrThenHydrate(hydrationNowIso: string) {
  vi.useFakeTimers({ now: new Date(SSR_NOW) })
  const html = renderToString(tree(SSR_NOW))

  vi.setSystemTime(new Date(CLIENT_NOW))
  const container = mounted.at(-1)!
  container.innerHTML = html

  const onRecoverableError = vi.fn()
  let root: ReturnType<typeof hydrateRoot>
  act(() => {
    root = hydrateRoot(container, tree(hydrationNowIso), { onRecoverableError })
  })
  roots.push(root!)
  return { html, container, onRecoverableError }
}

describe('UsersTable — hydration-stable relative dates', () => {
  it('renders the loader instant on both sides of a midnight-crossing hydration', () => {
    const { html, container, onRecoverableError } = ssrThenHydrate(SSR_NOW)

    // Server copy: the row was created on the loader's local day.
    expect(html).toContain('今天')
    // The first client render reused the loader clock, so hydration had no
    // reason to report a mismatch (the control below proves this can fail).
    expect(onRecoverableError).not.toHaveBeenCalled()

    // Only the post-mount clock tick advances the relative label.
    expect(container.textContent).toContain('昨天')
  })

  it('control: a drifting clock on the client IS reported as a hydration mismatch', () => {
    // What the render-time `new Date()` did: the browser already rolled over.
    const { onRecoverableError } = ssrThenHydrate(CLIENT_NOW)
    expect(onRecoverableError).toHaveBeenCalled()
  })
})
