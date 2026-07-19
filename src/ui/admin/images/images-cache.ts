import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'

// The image library is cached under orpcQuery's nested key grammar in both
// operation types: `type: 'infinite'` (ImagesView's grid) and `type: 'query'`
// (the editor's ImageLibraryPicker). The procedure-level key
// `[['admin','images','list'], {}]` partial-matches every input of both — a
// hand-rolled `['admin','images','list']` array can never match them
// (TanStack's prefix matcher bails on the first element-type mismatch),
// which is the stale-forever trap this seam exists to close: before it, an
// upload/delete in ImagesView left the picker's orpcQuery cache stale for
// the rest of the session.
export function invalidateImagesList(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.images.list.key() })
}
