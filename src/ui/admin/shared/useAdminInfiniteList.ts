import {
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery,
  useQueryClient,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'
import { toastApiError } from '@/client/lib/toast-api-error'

// Page contract shared by every admin list procedure: offset-paginated; `hasMore` gates the next fetch, `total` optional.
interface AdminListPageShape {
  hasMore: boolean
  total?: number
}

// Structural view of a procedure's infinite-list entry points, decoupled from the full router type.
interface AdminInfiniteListSource<TInput, TPage extends AdminListPageShape> {
  /** Procedure-level key — the scope `reset` drops cached pages for. */
  key(): QueryKey
  infiniteOptions(options: {
    input: (pageParam: number) => TInput
    initialPageParam: number
    getNextPageParam: (lastPage: TPage, allPages: TPage[], lastPageParam: number) => number | undefined
    enabled?: boolean
  }): UseInfiniteQueryOptions<TPage, Error, InfiniteData<TPage, number>, QueryKey, number> & { queryKey: QueryKey }
}

// Shared scaffold for admin infinite-scroll lists: server rows live only in the TanStack cache — views never rebuild the key.
export function useAdminInfiniteList<TInput, TPage extends AdminListPageShape, TRow>({
  namespace,
  pageSize,
  buildInput,
  selectRows,
  noun,
  enabled = true,
}: {
  /** Procedure utils exposing `infiniteOptions` — e.g. `orpcQuery.admin.posts.list`. */
  namespace: AdminInfiniteListSource<TInput, TPage>
  /** Rows fetched per page; may be dynamic (the users view reads it from filter state). */
  pageSize: number
  buildInput: (offset: number) => TInput
  selectRows: (page: TPage) => TRow[]
  /** Display noun for the error toast ('加载{noun}列表失败'). Omit when the view surfaces errors inline. */
  noun?: string
  /** Pass false to hold the query idle until the caller arms it (e.g. a search waiting for a submitted keyword). */
  enabled?: boolean
}) {
  const options = namespace.infiniteOptions({
    input: buildInput,
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => (lastPage.hasMore ? lastPageParam + pageSize : undefined),
    enabled,
  })
  const listQuery = useInfiniteQuery(options)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery

  const pages = listQuery.data?.pages ?? []
  const rows = pages.flatMap((page) => selectRows(page))
  const firstPage = pages[0]
  const total = firstPage?.total ?? 0

  useEffect(() => {
    if (noun && listQuery.error) {
      toastApiError(listQuery.error, `加载${noun}列表失败`)
    }
  }, [listQuery.error, noun])

  const sentinelRef = useInfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage })

  const queryClient = useQueryClient()
  // The query key rebuilds every render — pin the latest in a ref so `patchPages` stays referentially stable.
  const queryKeyRef = useRef(options.queryKey)
  useEffect(() => {
    queryKeyRef.current = options.queryKey
  }, [options.queryKey])
  const patchPages = useCallback(
    (patch: (data: InfiniteData<TPage, number>) => InfiniteData<TPage, number>) => {
      queryClient.setQueryData<InfiniteData<TPage, number>>(queryKeyRef.current, (old) => (old ? patch(old) : old))
    },
    [queryClient],
  )
  const reset = useCallback(() => {
    queryClient.removeQueries({ queryKey: namespace.key() })
  }, [queryClient, namespace])

  return {
    rows,
    total,
    /** Raw loaded pages — for cross-page derivations (e.g. search-hit dedupe). */
    pages,
    /** First loaded page — for page-level aggregates (e.g. comment status counts). */
    firstPage,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    /** Fetch error — surfaced as a toast when `noun` is set, otherwise the view renders it. */
    error: listQuery.error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    sentinelRef,
    /** Rewrite the cached pages in place after a mutation, skipping the refetch. */
    patchPages,
    /** Drop every cached page set for the procedure namespace. */
    reset,
  }
}
