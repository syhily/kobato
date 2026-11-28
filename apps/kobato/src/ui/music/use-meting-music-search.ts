import type { MetingSearchHit, MetingSource, SearchMusicOutput } from '@kobato/api/contracts/admin/music'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { useCallback, useMemo, useState } from 'react'

import { useAdminInfiniteList } from '@/ui/shared/list/use-admin-infinite-list'

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
    buildInput: (offset) => ({ ...submitted, keyword: submitted?.keyword ?? '', limit, offset }),
    selectRows: (page) => page.results,
    enabled: submitted !== null,
  })

  const results = useMemo(() => dedupeSearchHits(pages), [pages])

  const search = useCallback(({ source, keyword }: { source: MetingSource; keyword: string }) => {
    const trimmed = keyword.trim()
    if (trimmed === '') {
      return
    }
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
