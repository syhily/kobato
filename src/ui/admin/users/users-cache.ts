import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'

// Mutations on UsersView and UserDetailView must reach each other's cache,
// so this seam invalidates at the router level — `admin.users.key()`
// partial-matches every procedure, input, and operation in the namespace.
// A hand-rolled `['admin','users']` array can never match (TanStack's prefix
// matcher bails on the first element-type mismatch) — the stale-forever
// trap this seam exists to close.
export function invalidateUsersCache(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.users.key() })
}
