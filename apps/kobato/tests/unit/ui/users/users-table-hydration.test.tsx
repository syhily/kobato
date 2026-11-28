import { makeAdminUser } from '@kobato/api/tests/utils/catalog'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { DocumentFactsProvider } from '@kobato/ui/lib/document-facts-context'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
// @vitest-environment jsdom
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UsersTable } from '@/ui/users/UsersTable'

const config = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!

const CREATED_AT = '2026-11-07T17:00:00.000Z'
const SSR_NOW = '2026-11-08T15:59:00.000Z'
const CLIENT_NOW = '2026-11-08T16:00:30.000Z'

const rows = [makeAdminUser({ id: 'user-1', name: 'Alice', createdAt: CREATED_AT })]

function tree(nowIso: string) {
  const routes: RouteObject[] = [
    {
      id: 'root',
      path: '*',
      element: (
        <DocumentFactsProvider value={documentFactsFor({ nowIso })}>
          <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
            <UsersTable rows={rows} config={config} isLoading={false} />
          </I18nProvider>
        </DocumentFactsProvider>
      ),
    },
  ]
  return <RouterProvider router={createMemoryRouter(routes)} />
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

    expect(html).toContain('今天')
    expect(onRecoverableError).not.toHaveBeenCalled()

    expect(container.textContent).toContain('昨天')
  })

  it('control: a drifting clock on the client IS reported as a hydration mismatch', () => {
    const { onRecoverableError } = ssrThenHydrate(CLIENT_NOW)
    expect(onRecoverableError).toHaveBeenCalled()
  })
})
