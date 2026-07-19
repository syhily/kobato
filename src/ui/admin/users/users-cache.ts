import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'

// The users surface caches several procedures under orpcQuery's nested key
// grammar: `admin.users.list` (UsersView, plus the author pickers in
// PostsView/PagesView) and `admin.users.get` (UserDetailView). Mutations on
// either view must reach the other's cache, so the seam invalidates at the
// router level — `[['admin','users'], {}]` partial-matches every procedure,
// input, and operation type in the namespace. A hand-rolled
// `['admin','users']` array can never match them (TanStack's prefix matcher
// bails on the first element-type mismatch), which is the stale-forever
// trap this seam exists to close.
export function invalidateUsersCache(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.users.key() })
}
