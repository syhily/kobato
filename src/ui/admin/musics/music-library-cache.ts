import type { QueryClient } from '@tanstack/react-query'

import { orpcQuery } from '@/client/api/orpc-query'

// The library list is cached under orpcQuery's nested key grammar in both
// operation types: `type: 'query'` (AddMusicView's staleTime: Infinity hero,
// MusicPickerDialog) and `type: 'infinite'` (MusicsView's grid). The
// procedure-level key `[['admin','music','list'], {}]` partial-matches every
// input of both — a hand-rolled `['admin','music','list']` array can never
// match them (TanStack's prefix matcher bails on the first element-type
// mismatch), which is the stale-forever trap this seam exists to close.
export function invalidateMusicLibrary(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: orpcQuery.admin.music.list.key() })
}
