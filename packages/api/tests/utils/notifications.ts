import type { NotificationDto, NotificationTab } from '@kobato/api/contracts/public/notifications'
import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@kobato/api/browser/orpc-query'

export const NOTIFICATION_COUNT_KEY = orpcQuery.public.notifications.unreadCount.queryOptions({}).queryKey

export function makeNotificationItem(overrides: Partial<NotificationDto> = {}): NotificationDto {
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

export function notificationListKey(tab: NotificationTab) {
  return orpcQuery.public.notifications.list.infiniteOptions({
    input: (pageParam: string) => ({ tab, cursor: pageParam === '' ? undefined : pageParam, limit: 20 }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }).queryKey
}

export function seedNotificationTab(client: QueryClient, tab: NotificationTab, items: NotificationDto[]): void {
  client.setQueryData(notificationListKey(tab), { pages: [{ items, nextCursor: null }], pageParams: [''] })
}

export function cachedNotificationItems(client: QueryClient, tab: NotificationTab): NotificationDto[] {
  const data = client.getQueryData(notificationListKey(tab)) as
    | { pages: Array<{ items: NotificationDto[] }> }
    | undefined
  return data?.pages.flatMap((page) => page.items) ?? []
}

export function cachedUnreadNotificationCount(client: QueryClient): unknown {
  return client.getQueryData(NOTIFICATION_COUNT_KEY)
}
