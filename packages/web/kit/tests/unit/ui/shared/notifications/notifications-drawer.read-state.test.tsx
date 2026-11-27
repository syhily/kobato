// @vitest-environment happy-dom

import type { ReactElement, ReactNode } from 'react'

import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { BlogSettingsProvider } from '@kobato/ui/lib/blog-settings-context'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  client: null as any,
  invalidate: null as any,
  response: { count: 0 } as any,
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  harness.client = new actual.QueryClient()
  harness.invalidate = vi.spyOn(harness.client, 'invalidateQueries')
  return {
    ...actual,
    useQueryClient: () => harness.client,
    useMutation: (options: any) => ({
      mutate: () => {
        options.onSuccess?.(harness.response)
      },
      mutateAsync: async () => harness.response,
      isPending: false,
      isError: false,
      isSuccess: true,
    }),
    useQuery: (options: { queryKey: unknown }) => ({
      data: harness.client.getQueryData(options.queryKey),
      isPending: false,
      isError: false,
      error: null,
    }),
    useInfiniteQuery: (options: { queryKey: unknown }) => ({
      data: harness.client.getQueryData(options.queryKey),
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: () => undefined,
    }),
  }
})

const { NotificationsDrawer } = await import('@kobato/web-kit/ui/shared/notifications/NotificationsDrawer')
const { orpcQuery } = await import('@kobato/api/browser/orpc-query')
const { cachedNotificationItems, cachedUnreadNotificationCount, makeNotificationItem, seedNotificationTab } =
  await import('@kobato/api/tests/utils/notifications')

function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>{wrapWithI18n(children)}</BlogSettingsProvider>
    ),
  })
}

beforeEach(() => {
  harness.client.clear()
  harness.invalidate.mockClear()
  harness.response = { count: 0 }
})

describe('ui/shared/notifications/NotificationsDrawer read-state cache patch', () => {
  it('patches the row, drops it from the unread tab, and seeds the badge on mark-read', () => {
    harness.response = { count: 4 }
    const item = makeNotificationItem()
    seedNotificationTab(harness.client, 'all', [item])
    seedNotificationTab(harness.client, 'unread', [item])

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={1} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    expect(cachedNotificationItems(harness.client, 'all')[0].read).toBe(true)
    expect(cachedNotificationItems(harness.client, 'unread')).toHaveLength(0)
    expect(cachedUnreadNotificationCount(harness.client)).toEqual({ count: 4 })
    expect(harness.invalidate).not.toHaveBeenCalled()
  })

  it('flips the row back in place on mark-unread without touching the unread tab', () => {
    harness.response = { count: 2 }
    const item = makeNotificationItem({ read: true })
    seedNotificationTab(harness.client, 'all', [item])
    seedNotificationTab(harness.client, 'unread', [])

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)
    fireEvent.click(screen.getByLabelText('标为未读'))

    expect(cachedNotificationItems(harness.client, 'all')[0].read).toBe(false)
    expect(cachedNotificationItems(harness.client, 'unread')).toHaveLength(0)
    expect(cachedUnreadNotificationCount(harness.client)).toEqual({ count: 2 })
    expect(harness.invalidate).not.toHaveBeenCalled()
  })

  it('keeps the full invalidation for mark-all-read and seeds the badge from the response', () => {
    harness.response = { count: 0 }
    seedNotificationTab(harness.client, 'all', [makeNotificationItem()])
    seedNotificationTab(harness.client, 'unread', [makeNotificationItem()])

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={1} />)
    fireEvent.click(screen.getByLabelText('全部标为已读'))

    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: orpcQuery.public.notifications.key() })
    expect(cachedUnreadNotificationCount(harness.client)).toEqual({ count: 0 })
  })
})
