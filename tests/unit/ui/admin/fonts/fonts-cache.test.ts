import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { orpcQuery } from '@/client/api/orpc-query'
import { invalidateFontsList } from '@/ui/admin/fonts/fonts-cache'

// The mutation paths (FontsView delete / setSlot / package upload) all
// invalidate the library through `invalidateFontsList`, so this suite pins
// the cache behavior directly against a real QueryClient.
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

// FontsView fetches the library as a plain query. The react variant of the
// orpcQuery utils has no standalone `queryKey`; the options builder returns
// the exact key under `.queryKey`.
function seedFontsList(qc: QueryClient) {
  const listKey = orpcQuery.admin.fonts.list.queryOptions({ input: {} }).queryKey
  qc.setQueryData(listKey, { fonts: [] })
  return { listKey }
}

describe('ui/admin/fonts/invalidateFontsList', () => {
  it('invalidates the fonts list cache', async () => {
    const qc = makeQueryClient()
    const { listKey } = seedFontsList(qc)

    await invalidateFontsList(qc)

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true)
  })

  it('premise pin: a flat [admin, fonts, list] invalidation can never match an orpcQuery-keyed query', () => {
    const qc = makeQueryClient()
    const { listKey } = seedFontsList(qc)

    // The grammar this module replaced: TanStack's prefix matcher bails on
    // the first element-type mismatch (string vs nested path array), so the
    // flat key silently invalidated nothing. Guards against a flat-key
    // reintroduction or an orpc major-upgrade key change.
    void qc.invalidateQueries({ queryKey: ['admin', 'fonts', 'list'] })

    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(false)
  })
})
