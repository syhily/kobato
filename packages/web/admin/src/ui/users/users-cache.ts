import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'

// Mutations on both users views must reach each other's cache — invalidate
// at the router level (`admin.users.key()` partial-matches every procedure);
// a hand-rolled `['admin','users']` array never matches.
export function invalidateUsersCache(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.users.key() })
}
