import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@kobato/api/browser/orpc-query'

export function invalidateUsersCache(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.users.key() })
}
