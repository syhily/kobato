import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function seedBothListVariants(qc: QueryClient) {
  const gridKey = orpcQuery.admin.images.list.infiniteOptions({
    input: (pageParam: number) => ({ q: undefined, kind: undefined, offset: pageParam, limit: 60 }),
    initialPageParam: 0,
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

    void qc.invalidateQueries({ queryKey: ['admin', 'images', 'list'] })

    expect(qc.getQueryState(gridKey)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(pickerKey)?.isInvalidated).toBe(false)
  })
})
