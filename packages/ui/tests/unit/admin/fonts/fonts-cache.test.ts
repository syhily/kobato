import { orpcQuery } from '@kobato/client/api/orpc-query'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// FontsView's mutation paths invalidate the library inline at the call
// site through the procedure-level orpcQuery key. The react variant of
// the orpcQuery utils has no standalone `queryKey`; the options builder
// returns the exact key under `.queryKey`.
function seedFontsList(qc: QueryClient) {
  const listKey = orpcQuery.admin.fonts.list.queryOptions({ input: {} }).queryKey
  qc.setQueryData(listKey, { fonts: [] })
  return { listKey }
}

describe('ui/admin/fonts list cache — key grammar premise', () => {
  it('premise pin: a flat [admin, fonts, list] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { listKey } = seedFontsList(qc)

    // The grammar the inline call sites must never regress to: TanStack's
    // prefix matcher bails on the first element-type mismatch (string vs
    // nested path array), so a flat key silently invalidates nothing.
    // Guards against a flat-key reintroduction or an orpc major-upgrade
    // key change.
    void qc.invalidateQueries({ queryKey: ['admin', 'fonts', 'list'] })

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false)
  })
})
