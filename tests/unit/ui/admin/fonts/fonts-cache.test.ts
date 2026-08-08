import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { orpcQuery } from '@/client/api/orpc-query'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// FontsView invalidates through the procedure-level orpcQuery key (queryOptions().queryKey).
function seedFontsList(qc: QueryClient) {
  const listKey = orpcQuery.admin.fonts.list.queryOptions({ input: {} }).queryKey
  qc.setQueryData(listKey, { fonts: [] })
  return { listKey }
}

describe('ui/admin/fonts list cache — key grammar premise', () => {
  it('premise pin: a flat [admin, fonts, list] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { listKey } = seedFontsList(qc)

    // A flat [admin, fonts, list] key never matches the nested-path grammar and silently invalidates nothing.
    void qc.invalidateQueries({ queryKey: ['admin', 'fonts', 'list'] })

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false)
  })
})
