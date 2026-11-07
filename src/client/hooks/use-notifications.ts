import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  hashKey,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'

import type { NotificationDto, NotificationTab } from '@/shared/contracts/notifications'

import { orpcQuery } from '@/client/api/orpc-query'
import { NOTIFICATION_TABS } from '@/shared/contracts/notifications'
import { isRecord } from '@/shared/utils/type-guards'

/**
 * The unread badge count, polled every 120 s plus on window focus, and kept
 * fresh after any notification mutation — read-state flips patch it from the
 * mutation response (`usePatchNotificationReadState`), content changes
 * invalidate it (`useInvalidateNotifications`). The idle cadence is
 * deliberately slow —
 * ADR-0009 (`docs/adr/0009-notification-realtime-delivery.md`) adopts tuned
 * polling instead of SSE: an async inbox tolerates a stale badge while the
 * tab sits in the background, and the moments that matter refetch on demand.
 *
 * Exactly ONE observer per shell by design: `AppSidebar` on admin and
 * `BaseLayout` on public. Callers must pass the resulting count DOWN as a
 * prop (`NotificationsDrawer`, the nav items, the user menus) — do NOT add a
 * new call site. TanStack's `refetchInterval` runs one timer per observer
 * with no freshness check, and a shared cache entry does not dedupe
 * staggered timers, so extra observers silently multiply the fetch cadence.
 *
 * Tri-state on purpose: `null` means UNKNOWN (not loaded yet, or the query
 * failed) — never fold it into `0`, which is a confirmed "nothing unread".
 * Badges render `?? 0`; controls that a false zero would disable compare
 * against `0` explicitly.
 */
export function useUnreadNotificationCount(enabled = true): number | null {
  const query = useQuery(
    orpcQuery.notifications.unreadCount.queryOptions({
      refetchInterval: 120_000,
      refetchOnWindowFocus: true,
      enabled,
    }),
  )
  return query.data?.count ?? null
}

/**
 * Invalidate every notifications query (list pages, thread, unread count) after a
 * CONTENT-changing mutation (recall, reply, compose). Read-state-only flips use
 * `usePatchNotificationReadState` instead.
 */
export function useInvalidateNotifications(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: orpcQuery.notifications.key() })
  }
}

// oRPC's operation key shape (v1.16, pinned by a runtime probe during plan
// 020): `[procedurePath, { input?, type? }]`, where an infinite query's input
// is its FIRST page's input. So the list key is
// `[['notifications','list'], { input: { tab, limit }, type: 'infinite' }]`
// and the tab rides the key's second element. Derived per call (never at
// module scope) so importing this hook never depends on the router shape.
interface NotificationCacheKeys {
  scope: QueryKey
  unreadCount: QueryKey
  listPath: readonly unknown[]
}

function notificationCacheKeys(): NotificationCacheKeys {
  const [listPath] = orpcQuery.notifications.list.key()
  return {
    scope: orpcQuery.notifications.key(),
    unreadCount: orpcQuery.notifications.unreadCount.queryOptions({}).queryKey,
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

/**
 * Classify one cached notifications query key. `inert` = the payload is
 * unaffected by a read-state flip; `unknown` = a shape this patch does not
 * understand, so the caller must fall back to a full invalidation.
 */
function classifyNotificationQueryKey(queryKey: QueryKey, keys: NotificationCacheKeys): NotificationListMatch {
  if (hashKey(queryKey) === hashKey(keys.unreadCount)) {
    return 'inert'
  }
  const [path, state] = queryKey
  if (!Array.isArray(path) || !isRecord(state)) {
    return 'unknown'
  }
  const { type, input } = state
  // Thread messages carry no read flag of their own.
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
    // The unread tab never GAINS rows locally — the item may belong anywhere
    // in the ordering, so appending it would lie. The next poll reconciles.
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

  // Every other tab keeps the row in place — only its read flag moves.
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

/**
 * Apply a read-state mutation's server verdict to the notification cache:
 * seed the unread badge from the response's authoritative `count`, then flip
 * the rows in every cached list tab (removing them from `unread` on
 * mark-read). Never throws — any key shape, missing data, or page shape this
 * cannot parse falls back to a full invalidation.
 *
 * Pass an empty `ids` to only seed the badge (mark-all-read keeps its full
 * invalidation: every row in every tab changes).
 */
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
    // A cache patch must never break the mutation's success path.
    try {
      invalidateNotifications(queryClient, orpcQuery.notifications.key())
    } catch {
      // Nothing left to fall back to.
    }
  }
}

/**
 * Post-mutation patch for READ-STATE-ONLY changes (`markRead` /
 * `markUnread`): rewrites the cached pages and badge in place instead of
 * refetching every loaded page.
 *
 * Rule for new notification mutations: a mutation that only flips read
 * state uses this patch; a mutation that changes CONTENT (recall, reply,
 * compose — anything that adds, removes, or rewrites rows) MUST keep
 * `useInvalidateNotifications`.
 */
export function usePatchNotificationReadState(): (ids: string[], read: boolean, count: number) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (ids: string[], read: boolean, count: number) => patchNotificationReadState(queryClient, ids, read, count),
    [queryClient],
  )
}
