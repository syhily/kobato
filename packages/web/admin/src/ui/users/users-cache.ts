import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'

export function invalidateUsersCache(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.users.key() })
}
