import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { orpcQuery } from '@/client/api/orpc-query'
import { invalidateMusicLibrary } from '@/ui/admin/musics/music-library-cache'

// The mutation paths (MusicDetailView edit/delete, AddMusicView add) all
// invalidate the library through `invalidateMusicLibrary`, so this suite
// pins the cache behavior directly against a real QueryClient.
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// AddMusicView / MusicPickerDialog fetch the library as a plain query
// (staleTime: Infinity hero), MusicsView as an infinite grid — one
// procedure, two operation types, two distinct cache entries. The react
// variant of the orpcQuery utils has no standalone `queryKey`/`infiniteKey`;
// the options builders return the exact key under `.queryKey`.
function seedBothLibraryVariants(qc: QueryClient) {
  const heroKey = orpcQuery.admin.music.list.queryOptions({ input: { offset: 0, limit: 30 } }).queryKey
  const gridKey = orpcQuery.admin.music.list.infiniteOptions({
    input: (pageParam: number) => ({ offset: pageParam, limit: 24 }),
    initialPageParam: 0,
    // Irrelevant to the key (derived from `input(initialPageParam)` only),
    // but required by the options builder's type.
    getNextPageParam: () => undefined,
  }).queryKey
  qc.setQueryData(heroKey, { musics: [], total: 0, hasMore: false })
  qc.setQueryData(gridKey, { pages: [{ musics: [], total: 0, hasMore: false }], pageParams: [0] })
  return { heroKey, gridKey }
}

describe('ui/admin/musics/invalidateMusicLibrary', () => {
  it('invalidates both the query-type and infinite-type library caches', () => {
    const qc = makeQueryClient()
    const { heroKey, gridKey } = seedBothLibraryVariants(qc)

    invalidateMusicLibrary(qc)

    expect(qc.getQueryState(heroKey)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(gridKey)?.isInvalidated).toBe(true)
  })

  it('premise pin: a flat [admin, music, list] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { heroKey, gridKey } = seedBothLibraryVariants(qc)

    // The grammar this module replaced: TanStack's prefix matcher bails on
    // the first element-type mismatch (string vs nested path array), so the
    // flat key silently invalidated nothing. Guards against a flat-key
    // reintroduction or an orpc major-upgrade key change.
    void qc.invalidateQueries({ queryKey: ['admin', 'music', 'list'] })

    expect(qc.getQueryState(heroKey)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(gridKey)?.isInvalidated).toBe(false)
  })
})
