import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { orpcQuery } from '@/client/api/orpc-query'
import { invalidateImagesList } from '@/ui/admin/images/images-cache'

// The mutation paths (ImagesView delete / updateNote / recalculateThumbhash
// / upload-complete) all invalidate the library through
// `invalidateImagesList`, so this suite pins the cache behavior directly
// against a real QueryClient.
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// ImagesView caches the library as an infinite grid, the editor's
// ImageLibraryPicker as a plain query — one procedure, two operation types,
// two distinct cache entries. The react variant of the orpcQuery utils has
// no standalone `queryKey`/`infiniteKey`; the options builders return the
// exact key under `.queryKey`.
function seedBothListVariants(qc: QueryClient) {
  const gridKey = orpcQuery.admin.images.list.infiniteOptions({
    input: (pageParam: number) => ({ q: undefined, kind: undefined, offset: pageParam, limit: 60 }),
    initialPageParam: 0,
    // Irrelevant to the key (derived from `input(initialPageParam)` only),
    // but required by the options builder's type.
    getNextPageParam: () => undefined,
  }).queryKey
  const pickerKey = orpcQuery.admin.images.list.queryOptions({
    input: { kind: 'generic', limit: 60, q: undefined },
  }).queryKey
  qc.setQueryData(gridKey, { pages: [{ images: [], total: 0, hasMore: false }], pageParams: [0] })
  qc.setQueryData(pickerKey, { images: [], total: 0, hasMore: false })
  return { gridKey, pickerKey }
}

describe('ui/admin/images/invalidateImagesList', () => {
  it('invalidates both the infinite grid cache and the picker query cache', () => {
    const qc = makeQueryClient()
    const { gridKey, pickerKey } = seedBothListVariants(qc)

    invalidateImagesList(qc)

    expect(qc.getQueryState(gridKey)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(pickerKey)?.isInvalidated).toBe(true)
  })

  it('premise pin: a flat [admin, images, list] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { gridKey, pickerKey } = seedBothListVariants(qc)

    // The grammar this module replaced: TanStack's prefix matcher bails on
    // the first element-type mismatch (string vs nested path array), so the
    // flat key silently invalidated nothing. Guards against a flat-key
    // reintroduction or an orpc major-upgrade key change.
    void qc.invalidateQueries({ queryKey: ['admin', 'images', 'list'] })

    expect(qc.getQueryState(gridKey)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(pickerKey)?.isInvalidated).toBe(false)
  })
})
