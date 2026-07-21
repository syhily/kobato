import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { orpcQuery } from '@/client/api/orpc-query'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// ImagesView's mutation paths invalidate the library inline at the call
// site through the procedure-level orpcQuery key. The grid caches the
// library as an infinite query, the editor's ImageLibraryPicker as a plain
// query — one procedure, two operation types, two distinct cache entries.
// The react variant of the orpcQuery utils has no standalone
// `queryKey`/`infiniteKey`; the options builders return the exact key
// under `.queryKey`.
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

describe('ui/admin/images list cache — key grammar premise', () => {
  it('premise pin: a flat [admin, images, list] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { gridKey, pickerKey } = seedBothListVariants(qc)

    // The grammar the inline call sites must never regress to: TanStack's
    // prefix matcher bails on the first element-type mismatch (string vs
    // nested path array), so a flat key silently invalidates nothing.
    // Guards against a flat-key reintroduction or an orpc major-upgrade
    // key change.
    void qc.invalidateQueries({ queryKey: ['admin', 'images', 'list'] })

    expect(qc.getQueryState(gridKey)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(pickerKey)?.isInvalidated).toBe(false)
  })
})
