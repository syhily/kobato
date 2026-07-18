// @vitest-environment happy-dom

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MetingSearchHit, SearchMusicOutput } from '@/shared/types/music'

// Mock the oRPC client so no fetch ever fires. The mock captures every
// search call and lets each test program canned pages by offset.
const searchMock = vi.hoisted(() =>
  vi.fn<(input: { source?: string; keyword: string; limit?: number; offset?: number }) => Promise<SearchMusicOutput>>(),
)

vi.mock('@/client/api/client', () => ({
  orpc: {
    admin: {
      music: {
        search: (input: { source?: string; keyword: string; limit?: number; offset?: number }) => searchMock(input),
      },
    },
  },
}))

import { dedupeSearchHits, useMetingMusicSearch } from '@/ui/admin/musics/useMetingMusicSearch'

// The hook owns a `useInfiniteQuery` + `useQueryClient`, so tests need a real
// QueryClient above the hook. Effects must run (happy-dom + the
// @testing-library/react runner), unlike the SSR `#/_helpers/hook` runner.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

let hitSeq = 0
function makeHit(overrides: Partial<MetingSearchHit> = {}): MetingSearchHit {
  hitSeq += 1
  return {
    source: 'netease',
    sourceId: `id-${hitSeq}`,
    name: `Song ${hitSeq}`,
    artist: [`Artist ${hitSeq}`],
    album: `Album ${hitSeq}`,
    coverUrl: '',
    previewUrl: `https://example.com/preview-${hitSeq}.mp3`,
    ...overrides,
  }
}

function makePage(results: MetingSearchHit[], hasMore: boolean): SearchMusicOutput {
  return { results, hasMore }
}

describe('dedupeSearchHits', () => {
  it('keeps the first occurrence on source:sourceId collision across pages and preserves order', () => {
    const a = makeHit({ sourceId: 'a' })
    const b = makeHit({ sourceId: 'b' })
    const bDupe = makeHit({ sourceId: 'b', name: 'B duplicate' })
    const c = makeHit({ sourceId: 'c' })
    expect(dedupeSearchHits([makePage([a, b], true), makePage([bDupe, c], false)])).toEqual([a, b, c])
  })

  it('does not treat the same sourceId from a different source as a dupe', () => {
    const fromNetease = makeHit({ source: 'netease', sourceId: 'same' })
    const fromTencent = makeHit({ source: 'tencent', sourceId: 'same' })
    expect(dedupeSearchHits([makePage([fromNetease, fromTencent], false)])).toEqual([fromNetease, fromTencent])
  })

  it('returns [] for empty pages', () => {
    expect(dedupeSearchHits([])).toEqual([])
    expect(dedupeSearchHits([makePage([], false), makePage([], false)])).toEqual([])
  })
})

describe('useMetingMusicSearch', () => {
  beforeEach(() => {
    searchMock.mockReset()
  })

  it('starts idle: empty results, no hasMore, not searching, no fetch fired', () => {
    const { result } = renderHook(() => useMetingMusicSearch({ limit: 2 }), { wrapper: makeWrapper() })
    expect(result.current.results).toEqual([])
    expect(result.current.hasMore).toBe(false)
    expect(result.current.isSearching).toBe(false)
    expect(result.current.isLoadingMore).toBe(false)
    expect(result.current.error).toBeNull()
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('search() fetches page 1, exposes its hits, and is true on isSearching in flight', async () => {
    const hitA = makeHit({ sourceId: 'a' })
    const hitB = makeHit({ sourceId: 'b' })
    let resolveSearch!: (page: SearchMusicOutput) => void
    searchMock.mockImplementation(
      () =>
        new Promise<SearchMusicOutput>((resolve) => {
          resolveSearch = resolve
        }),
    )
    const { result } = renderHook(() => useMetingMusicSearch({ limit: 2 }), { wrapper: makeWrapper() })

    act(() => {
      result.current.search({ source: 'netease', keyword: '  hello  ' })
    })
    expect(result.current.isSearching).toBe(true)
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock).toHaveBeenCalledWith({ source: 'netease', keyword: 'hello', limit: 2, offset: 0 })

    act(() => {
      resolveSearch(makePage([hitA, hitB], true))
    })
    await waitFor(() => expect(result.current.results).toEqual([hitA, hitB]))
    expect(result.current.isSearching).toBe(false)
    expect(result.current.hasMore).toBe(true)
  })

  it('search() trims and no-ops on an empty keyword', () => {
    const { result } = renderHook(() => useMetingMusicSearch({ limit: 2 }), { wrapper: makeWrapper() })
    act(() => {
      result.current.search({ source: 'netease', keyword: '   ' })
    })
    expect(result.current.results).toEqual([])
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('loadMore() appends page 2, dedupes the overlap, and stops firing once hasMore is false', async () => {
    const hitA = makeHit({ sourceId: 'a' })
    const hitB = makeHit({ sourceId: 'b' })
    const hitC = makeHit({ sourceId: 'c' })
    searchMock.mockImplementation(({ offset = 0 }) =>
      Promise.resolve(offset === 0 ? makePage([hitA, hitB], true) : makePage([hitB, hitC], false)),
    )
    const { result } = renderHook(() => useMetingMusicSearch({ limit: 2 }), { wrapper: makeWrapper() })

    act(() => {
      result.current.search({ source: 'netease', keyword: 'hello' })
    })
    await waitFor(() => expect(result.current.results).toEqual([hitA, hitB]))

    act(() => {
      result.current.loadMore()
    })
    await waitFor(() => expect(result.current.results).toEqual([hitA, hitB, hitC]))
    expect(searchMock).toHaveBeenCalledTimes(2)
    expect(searchMock).toHaveBeenLastCalledWith({ source: 'netease', keyword: 'hello', limit: 2, offset: 2 })
    expect(result.current.hasMore).toBe(false)

    act(() => {
      result.current.loadMore()
    })
    expect(searchMock).toHaveBeenCalledTimes(2)
  })

  it('reset() clears results and the cache — a repeat search() refetches from offset 0', async () => {
    const hitA = makeHit({ sourceId: 'a' })
    searchMock.mockResolvedValue(makePage([hitA], false))
    const { result } = renderHook(() => useMetingMusicSearch({ limit: 2 }), { wrapper: makeWrapper() })

    act(() => {
      result.current.search({ source: 'netease', keyword: 'hello' })
    })
    await waitFor(() => expect(result.current.results).toEqual([hitA]))
    expect(searchMock).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.reset()
    })
    expect(result.current.results).toEqual([])
    expect(result.current.hasMore).toBe(false)
    expect(result.current.error).toBeNull()

    act(() => {
      result.current.search({ source: 'netease', keyword: 'hello' })
    })
    await waitFor(() => expect(result.current.results).toEqual([hitA]))
    expect(searchMock).toHaveBeenCalledTimes(2)
    expect(searchMock).toHaveBeenLastCalledWith({ source: 'netease', keyword: 'hello', limit: 2, offset: 0 })
  })

  it('rejected fetch surfaces its message on error', async () => {
    searchMock.mockRejectedValue(new Error('upstream exploded'))
    const { result } = renderHook(() => useMetingMusicSearch({ limit: 2 }), { wrapper: makeWrapper() })

    act(() => {
      result.current.search({ source: 'netease', keyword: 'hello' })
    })
    await waitFor(() => expect(result.current.error).toBe('upstream exploded'))
    expect(result.current.results).toEqual([])
    expect(result.current.isSearching).toBe(false)
  })
})
