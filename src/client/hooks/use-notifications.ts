import { useQuery, useQueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'

/**
 * The unread badge count, polled on a minute cadence plus window focus.
 * Every consumer shares one TanStack cache entry, so the sidebar nav item,
 * the avatar dot, and the public user menu never multiply fetches.
 */
export function useUnreadNotificationCount(enabled = true): number {
  const query = useQuery(
    orpcQuery.notifications.unreadCount.queryOptions({
      refetchInterval: 60_000,
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
