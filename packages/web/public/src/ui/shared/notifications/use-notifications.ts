import { orpcQuery } from '@kobato/api/browser/orpc-query'
import {
  type NotificationDto,
  type NotificationTab,
  NOTIFICATION_TABS,
} from '@kobato/api/contracts/account/notifications'
import { isRecord } from '@kobato/utils/type-guards'
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  hashKey,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'

export function useUnreadNotificationCount(enabled = true): number | null {
  const query = useQuery(
    orpcQuery.account.notifications.unreadCount.queryOptions({
      refetchInterval: 120_000,
      refetchOnWindowFocus: true,
      enabled,
    }),
  )
  return query.data?.count ?? null
}

export function useInvalidateNotifications(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: orpcQuery.account.notifications.key() })
  }
}

interface NotificationCacheKeys {
  scope: QueryKey
  unreadCount: QueryKey
  listPath: readonly unknown[]
}

function notificationCacheKeys(): NotificationCacheKeys {
  const [listPath] = orpcQuery.account.notifications.list.key()
  return {
    scope: orpcQuery.account.notifications.key(),
    unreadCount: orpcQuery.account.notifications.unreadCount.queryOptions({}).queryKey,
    listPath: Array.isArray(listPath) ? listPath : [],
  }
}

interface NotificationListPage {
  items: NotificationDto[]
  nextCursor: string | null
}

type NotificationPages = InfiniteData<NotificationListPage, string>

type NotificationListMatch = { tab: NotificationTab } | 'inert' | 'unknown'

function samePath(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index])
}

function isNotificationTab(value: unknown): value is NotificationTab {
  return NOTIFICATION_TABS.some((tab) => tab === value)
}

function isNotificationPages(value: unknown): value is NotificationPages {
  if (!isRecord(value)) {
    return false
  }
  return Array.isArray(value.pages) && value.pages.every((page) => isRecord(page) && Array.isArray(page.items))
}

function classifyNotificationQueryKey(queryKey: QueryKey, keys: NotificationCacheKeys): NotificationListMatch {
  if (hashKey(queryKey) === hashKey(keys.unreadCount)) {
    return 'inert'
  }
  const [path, state] = queryKey
  if (!Array.isArray(path) || !isRecord(state)) {
    return 'unknown'
  }
  const { type, input } = state
  if (type === 'query' && path[path.length - 1] === 'thread') {
    return 'inert'
  }
  if (type !== 'infinite' || !samePath(path, keys.listPath)) {
    return 'unknown'
  }
  const tab = isRecord(input) ? input.tab : undefined
  return isNotificationTab(tab) ? { tab } : 'unknown'
}

function patchNotificationPages(
  data: NotificationPages,
  tab: NotificationTab,
  ids: ReadonlySet<string>,
  read: boolean,
): NotificationPages {
  if (tab === 'unread') {
    if (!read) {
      return data
    }
    let removed = false
    const pages = data.pages.map((page) => {
      const items = page.items.filter((item) => !ids.has(item.id))
      if (items.length === page.items.length) {
        return page
      }
      removed = true
      return { ...page, items }
    })
    return removed ? { ...data, pages } : data
  }

  let changed = false
  const pages = data.pages.map((page) => {
    let pageChanged = false
    const items = page.items.map((item) => {
      if (!ids.has(item.id) || item.read === read) {
        return item
      }
      pageChanged = true
      return { ...item, read }
    })
    if (!pageChanged) {
      return page
    }
    changed = true
    return { ...page, items }
  })
  return changed ? { ...data, pages } : data
}

function invalidateNotifications(queryClient: QueryClient, scope: QueryKey): void {
  void queryClient.invalidateQueries({ queryKey: scope })
}

export function patchNotificationReadState(
  queryClient: QueryClient,
  ids: string[],
  read: boolean,
  count: number,
): void {
  try {
    const keys = notificationCacheKeys()
    queryClient.setQueryData(keys.unreadCount, { count })
    const idSet = new Set(ids)
    let uncertain = false
    for (const query of queryClient.getQueryCache().findAll({ queryKey: keys.scope })) {
      const match = classifyNotificationQueryKey(query.queryKey, keys)
      if (match === 'inert') {
        continue
      }
      const cached = query.state.data
      if (match === 'unknown' || (cached !== undefined && !isNotificationPages(cached))) {
        uncertain = true
        continue
      }
      queryClient.setQueriesData<NotificationPages>({ queryKey: query.queryKey, exact: true }, (data) =>
        data === undefined ? data : patchNotificationPages(data, match.tab, idSet, read),
      )
    }
    if (uncertain) {
      invalidateNotifications(queryClient, keys.scope)
    }
  } catch {
    try {
      invalidateNotifications(queryClient, orpcQuery.account.notifications.key())
    } catch {}
  }
}

export function usePatchNotificationReadState(): (ids: string[], read: boolean, count: number) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (ids: string[], read: boolean, count: number) => patchNotificationReadState(queryClient, ids, read, count),
    [queryClient],
  )
}
