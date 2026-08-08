import { useCallback, useMemo, useState } from 'react'

import type { MetingSearchHit, MetingSource, SearchMusicOutput } from '@/shared/contracts/music'

import { orpcQuery } from '@/client/api/orpc-query'
import { useAdminInfiniteList } from '@/ui/admin/shared/useAdminInfiniteList'

// Flatten pages into one hit list, first occurrence winning on `source:sourceId` — pure for direct unit tests.
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

// Search-pagination machine on the shared infinite-list scaffold (the search
// endpoint reports only `hasMore`); callers keep their own inputs, add
// mutation, and preview wiring.
export function useMetingMusicSearch({ limit }: { limit: number }) {
  const [submitted, setSubmitted] = useState<{ source: MetingSource; keyword: string } | null>(null)

  const {
    pages,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    error,
    reset: resetSearchCache,
  } = useAdminInfiniteList({
    namespace: orpcQuery.admin.music.search,
    pageSize: limit,
    // `enabled` gates on submitted !== null, so the ''-keyword branch is only ever embedded in the disabled key — never sent.
    buildInput: (offset) => ({ ...submitted, keyword: submitted?.keyword ?? '', limit, offset }),
    selectRows: (page) => page.results,
    // No `noun`: the dialog/view renders the error inline instead of a toast.
    enabled: submitted !== null,
  })

  const results = useMemo(() => dedupeSearchHits(pages), [pages])

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
    resetSearchCache()
  }, [resetSearchCache])

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
