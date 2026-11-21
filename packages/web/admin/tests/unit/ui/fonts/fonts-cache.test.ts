import { orpcQuery } from '@kobato/web-client/api/orpc-query'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

function seedFontsList(qc: QueryClient) {
  const listKey = orpcQuery.admin.fonts.list.queryOptions({ input: {} }).queryKey
  qc.setQueryData(listKey, { fonts: [] })
  return { listKey }
}

describe('ui/admin/fonts list cache — key grammar premise', () => {
  it('premise pin: a flat [admin, fonts, list] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { listKey } = seedFontsList(qc)

    void qc.invalidateQueries({ queryKey: ['admin', 'fonts', 'list'] })

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false)
  })
})
