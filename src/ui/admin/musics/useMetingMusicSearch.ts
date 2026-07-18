import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

import type { MetingSearchHit, MetingSource, SearchMusicOutput } from '@/shared/types/music'

import { orpcQuery } from '@/client/api/orpc-query'

// Flatten fetched pages into one hit list, first occurrence winning on
// `source:sourceId` collisions — upstream pages can overlap when the
// provider's result set shifts between page fetches. Exported pure so unit
// tests can exercise it without mounting the hook.
export function dedupeSearchHits(pages: SearchMusicOutput[]): MetingSearchHit[] {
  const seen = new Set<string>()
  return pages
    .flatMap((page) => page.results)
    .filter((hit) => {
      const key = `${hit.source}:${hit.sourceId}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

// One search-pagination machine for the meting "add music" surfaces.
// `useInfiniteQuery`'s pages ARE the accumulation — the hook holds no
// offset state, no result state, and no mirror refs. Callers render only:
// they keep their own keyword/source inputs, add mutation, and preview
// wiring, and drive the machine through `search` / `loadMore` / `reset`.
export function useMetingMusicSearch({ limit }: { limit: number }) {
  const [submitted, setSubmitted] = useState<{ source: MetingSource; keyword: string } | null>(null)
  const queryClient = useQueryClient()

  const searchQuery = useInfiniteQuery(
    orpcQuery.admin.music.search.infiniteOptions({
      // `enabled` gates on submitted !== null, so the null branch below
      // (keyword '') is only ever embedded in the disabled query's key —
      // it is never sent to the server.
      input: (pageParam: number) => ({ ...submitted, keyword: submitted?.keyword ?? '', limit, offset: pageParam }),
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        if (!lastPage.hasMore) {
          return undefined
        }
        return (lastPageParam ?? 0) + limit
      },
      initialPageParam: 0,
      enabled: submitted !== null,
      staleTime: 0,
    }),
  )

  const { data, error, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage } = searchQuery

  const results = useMemo(() => dedupeSearchHits(data?.pages ?? []), [data])

  const search = useCallback(({ source, keyword }: { source: MetingSource; keyword: string }) => {
    const trimmed = keyword.trim()
    if (trimmed === '') {
      return
    }
    // A changed submitted value changes the query key, which resets pages.
    setSubmitted({ source, keyword: trimmed })
  }, [])

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const reset = useCallback(() => {
    setSubmitted(null)
    queryClient.removeQueries({ queryKey: orpcQuery.admin.music.search.key() })
  }, [queryClient])

  return {
    results,
    hasMore: hasNextPage ?? false,
    isSearching: isFetching && !isFetchingNextPage,
    isLoadingMore: isFetchingNextPage,
    error: error?.message ?? null,
    search,
    loadMore,
    reset,
  }
}
