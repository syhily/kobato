import { type InfiniteData, type QueryKey, useInfiniteQuery, type UseInfiniteQueryOptions } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { useInfiniteScrollSentinel } from '@/client/hooks/use-infinite-scroll-sentinel'

// Page contract shared by every admin list procedure: offset-paginated,
// `hasMore` gates the next fetch and `total` feeds the header counters.
interface AdminListPageShape {
  hasMore: boolean
  total: number
}

// Structural view of an oRPC procedure's TanStack utils, narrowed to the
// infinite-list entry point the hook drives. Declaring it structurally lets
// each call site's concrete procedure utils (posts, users, comments, …)
// satisfy the interface without coupling the hook to the full router type.
interface AdminInfiniteListSource<TInput, TPage extends AdminListPageShape> {
  infiniteOptions(options: {
    input: (pageParam: number) => TInput
    initialPageParam: number
    getNextPageParam: (lastPage: TPage, allPages: TPage[], lastPageParam: number) => number | undefined
  }): UseInfiniteQueryOptions<TPage, Error, InfiniteData<TPage, number>, QueryKey, number> & { queryKey: QueryKey }
}

// Shared scaffold for the admin infinite-scroll lists: owns the
// infiniteQuery options assembly, the offset arithmetic, the rows/total
// derivation, the error toast, and the sentinel wiring. Views keep their
// filter state (mirrored into `buildInput`) and their row rendering.
//
// Server rows live exclusively in the TanStack cache — every loaded page is
// refetched together on invalidation, and mutations invalidate the procedure
// namespace instead of patching local mirrors.
export function useAdminInfiniteList<TInput, TPage extends AdminListPageShape, TRow>({
  namespace,
  pageSize,
  buildInput,
  selectRows,
  noun,
}: {
  /** Procedure utils exposing `infiniteOptions` — e.g. `orpcQuery.admin.posts.list`. */
  namespace: AdminInfiniteListSource<TInput, TPage>
  /** Rows fetched per page; may be dynamic (the users view reads it from filter state). */
  pageSize: number
  buildInput: (offset: number) => TInput
  selectRows: (page: TPage) => TRow[]
  /** Display noun for the error toast ('加载{noun}列表失败') and the list footer. */
  noun: string
}) {
  const options = namespace.infiniteOptions({
    input: buildInput,
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => (lastPage.hasMore ? lastPageParam + pageSize : undefined),
  })
  const listQuery = useInfiniteQuery(options)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery

  const rows = listQuery.data?.pages.flatMap((page) => selectRows(page)) ?? []
  const firstPage = listQuery.data?.pages[0]
  const total = firstPage?.total ?? 0

  useEffect(() => {
    if (listQuery.error) {
      toast.error(`加载${noun}列表失败`, { description: listQuery.error.message })
    }
  }, [listQuery.error, noun])

  const sentinelRef = useInfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage })

  return {
    rows,
    total,
    /** First loaded page — for page-level aggregates (e.g. comment status counts). */
    firstPage,
    isLoading: listQuery.isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    sentinelRef,
    /** Exact key of the assembled query — for cache patches via `setQueryData`. */
    queryKey: options.queryKey,
  }
}
