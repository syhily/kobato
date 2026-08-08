import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { orpcQuery } from '@/client/api/orpc-query'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// One procedure (admin.images.list), two operation types — infinite grid
// and plain picker query — so two distinct cache entries. The options
// builders return the exact key under `.queryKey`.
function seedBothListVariants(qc: QueryClient) {
  const gridKey = orpcQuery.admin.images.list.infiniteOptions({
    input: (pageParam: number) => ({ q: undefined, kind: undefined, offset: pageParam, limit: 60 }),
    initialPageParam: 0,
    // Type-required no-op: the key derives from `input(initialPageParam)` only.
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

    // TanStack's prefix matcher bails on the first element-type mismatch (string vs nested path array), so a flat key never matches.
    void qc.invalidateQueries({ queryKey: ['admin', 'images', 'list'] })

    expect(qc.getQueryState(gridKey)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(pickerKey)?.isInvalidated).toBe(false)
  })
})
