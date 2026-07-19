import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'

// The font library list is cached under orpcQuery's nested key grammar
// (FontsView's `type: 'query'` fetch). The procedure-level key
// `[['admin','fonts','list'], {}]` partial-matches every input and operation
// type of the procedure — a hand-rolled `['admin','fonts','list']` array can
// never match them (TanStack's prefix matcher bails on the first
// element-type mismatch), which is the stale-forever trap this seam exists
// to close. The promise is returned so the package-upload path can await
// the refetch before showing its success phase; fire-and-forget callers
// `void` it.
export function invalidateFontsList(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: orpcQuery.admin.fonts.list.key() })
}
