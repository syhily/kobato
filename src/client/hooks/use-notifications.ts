import { useQuery, useQueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'

/**
 * The unread badge count, polled every 120 s plus on window focus, and
 * invalidated after any notification mutation (see
 * `useInvalidateNotifications`). The idle cadence is deliberately slow —
 * ADR-0009 (`docs/adr/0009-notification-realtime-delivery.md`) adopts tuned
 * polling instead of SSE: an async inbox tolerates a stale badge while the
 * tab sits in the background, and the moments that matter refetch on demand.
 * Every consumer shares one TanStack cache entry, so the sidebar nav item,
 * the avatar dot, and the public user menu never multiply fetches.
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
