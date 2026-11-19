import { orpcQuery } from '@kobato/web-client/api/orpc-query.ts'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function seedBothLibraryVariants(qc: QueryClient) {
  const heroKey = orpcQuery.admin.music.list.queryOptions({ input: { offset: 0, limit: 30 } }).queryKey
  const gridKey = orpcQuery.admin.music.list.infiniteOptions({
    input: (pageParam: number) => ({ offset: pageParam, limit: 24 }),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  }).queryKey
  qc.setQueryData(heroKey, { musics: [], total: 0, hasMore: false })
  qc.setQueryData(gridKey, { pages: [{ musics: [], total: 0, hasMore: false }], pageParams: [0] })
  return { heroKey, gridKey }
}

describe('ui/admin/musics library cache — key grammar premise', () => {
  it('premise pin: a flat [admin, music, list] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { heroKey, gridKey } = seedBothLibraryVariants(qc)

    void qc.invalidateQueries({ queryKey: ['admin', 'music', 'list'] })

    expect(qc.getQueryState(heroKey)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(gridKey)?.isInvalidated).toBe(false)
  })
})
