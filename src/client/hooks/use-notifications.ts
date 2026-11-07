import { useQuery, useQueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'

/**
 * The unread badge count, polled every 120 s plus on window focus, and
 * invalidated after any notification mutation (see
 * `useInvalidateNotifications`). The idle cadence is deliberately slow —
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
 */
export function useUnreadNotificationCount(enabled = true): number {
  const query = useQuery(
    orpcQuery.notifications.unreadCount.queryOptions({
      refetchInterval: 120_000,
      refetchOnWindowFocus: true,
      enabled,
    }),
  )
  return query.data?.count ?? 0
}

/** Invalidate every notifications query (list pages, thread, unread count) after a mutation. */
export function useInvalidateNotifications(): () => Promise<void> {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: orpcQuery.notifications.key() })
  }
}
