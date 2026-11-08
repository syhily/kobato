// @vitest-environment happy-dom

import type { ReactElement, ReactNode } from 'react'

import { fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotificationDto, NotificationTab } from '@/shared/contracts/notifications'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { wrapWithI18n } from '#/_helpers/i18n-render'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'

// The canonical `mockTanstackQuery()` cannot express this suite: the patch
// path needs a REAL QueryClient (cache writes against oRPC's infinite-key
// shape) and a mutation double that actually runs `onSuccess`. Behavioural
// mock by design — see tests/AGENTS.md.
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

const { NotificationsDrawer } = await import('@/ui/shared/notifications/NotificationsDrawer')
const { orpcQuery } = await import('@/client/api/orpc-query')
const { patchNotificationReadState } = await import('@/client/hooks/use-notifications')

// The drawer reads `useI18n()` and the site identity; both providers ride the
// render wrapper (a wrapper, not inline JSX, so cache assertions keep their tree).
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>{wrapWithI18n(children)}</BlogSettingsProvider>
    ),
  })
}

const COUNT_KEY = orpcQuery.notifications.unreadCount.queryOptions({}).queryKey

function makeItem(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: '1',
    threadId: '1',
    kind: 'broadcast',
    title: '系统升级公告',
    body: '今晚 24 点例行维护',
    sender: null,
    replyable: false,
    source: null,
    actionUrl: null,
    createdAt: new Date('2026-11-07T08:00:00Z').toISOString(),
    read: false,
    ...overrides,
  }
}

/** The pane's own key construction — same input shape, so the cached entry is the one the patch scans. */
function listKey(tab: NotificationTab) {
  return orpcQuery.notifications.list.infiniteOptions({
    input: (pageParam: string) => ({ tab, cursor: pageParam === '' ? undefined : pageParam, limit: 20 }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }).queryKey
}

function seedTab(tab: NotificationTab, items: NotificationDto[]) {
  harness.client.setQueryData(listKey(tab), { pages: [{ items, nextCursor: null }], pageParams: [''] })
}

function cachedItems(tab: NotificationTab): NotificationDto[] {
  const data = harness.client.getQueryData(listKey(tab)) as { pages: Array<{ items: NotificationDto[] }> } | undefined
  return data?.pages.flatMap((page) => page.items) ?? []
}

function cachedUnreadCount(): unknown {
  return harness.client.getQueryData(COUNT_KEY)
}

beforeEach(() => {
  harness.client.clear()
  harness.invalidate.mockClear()
  harness.response = { count: 0 }
})

describe('ui/shared/notifications read-state cache patch', () => {
  it('patches the row, drops it from the unread tab, and seeds the badge on mark-read', () => {
    harness.response = { count: 4 }
    const item = makeItem()
    seedTab('all', [item])
    seedTab('unread', [item])

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={1} />)
    fireEvent.click(screen.getByText('系统升级公告'))

    expect(cachedItems('all')[0].read).toBe(true)
    expect(cachedItems('unread')).toHaveLength(0)
    expect(cachedUnreadCount()).toEqual({ count: 4 })
    // The whole point: no list refetch chain.
    expect(harness.invalidate).not.toHaveBeenCalled()
  })

  it('flips the row back in place on mark-unread without touching the unread tab', () => {
    harness.response = { count: 2 }
    const item = makeItem({ read: true })
    seedTab('all', [item])
    seedTab('unread', [])

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={0} />)
    fireEvent.click(screen.getByLabelText('标为未读'))

    expect(cachedItems('all')[0].read).toBe(false)
    // The unread tab never gains rows locally — the next poll reconciles.
    expect(cachedItems('unread')).toHaveLength(0)
    expect(cachedUnreadCount()).toEqual({ count: 2 })
    expect(harness.invalidate).not.toHaveBeenCalled()
  })

  it('keeps the full invalidation for mark-all-read and seeds the badge from the response', () => {
    harness.response = { count: 0 }
    seedTab('all', [makeItem()])
    seedTab('unread', [makeItem()])

    render(<NotificationsDrawer open onOpenChange={() => {}} isAdmin={false} unreadCount={1} />)
    fireEvent.click(screen.getByLabelText('全部标为已读'))

    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: orpcQuery.notifications.key() })
    expect(cachedUnreadCount()).toEqual({ count: 0 })
  })

  it('leaves the unread tab untouched when the flip is to unread', () => {
    const item = makeItem()
    seedTab('unread', [item])

    patchNotificationReadState(harness.client, [item.id], false, 1)

    expect(cachedItems('unread')).toHaveLength(1)
  })

  it('falls back to a full invalidation for a notifications key it cannot parse', () => {
    const item = makeItem()
    seedTab('all', [item])
    harness.client.setQueryData([['notifications', 'futureProcedure'], { type: 'query' }], { whatever: true })

    patchNotificationReadState(harness.client, [item.id], true, 3)

    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: orpcQuery.notifications.key() })
    // Parseable tabs are still patched; the refetch is what reconciles the rest.
    expect(cachedItems('all')[0].read).toBe(true)
    expect(cachedUnreadCount()).toEqual({ count: 3 })
  })

  it('never throws when a cached page set has an unexpected shape', () => {
    harness.client.setQueryData(listKey('all'), 'not pages')

    expect(() => patchNotificationReadState(harness.client, ['1'], true, 1)).not.toThrow()
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: orpcQuery.notifications.key() })
  })
})
