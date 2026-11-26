import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useInfiniteScrollSentinel } from '@kobato/ui/lib/use-infinite-scroll-sentinel'
import { toastApiError } from '@kobato/web-kit/ui/lib/toast-api-error'
import {
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery,
  useQueryClient,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

interface AdminListPageShape {
  hasMore: boolean
  total?: number
}

interface AdminInfiniteListSource<TInput, TPage extends AdminListPageShape> {
  key(): QueryKey
  infiniteOptions(options: {
    input: (pageParam: number) => TInput
    initialPageParam: number
    getNextPageParam: (lastPage: TPage, allPages: TPage[], lastPageParam: number) => number | undefined
    enabled?: boolean
    refetchInterval?: number
  }): UseInfiniteQueryOptions<TPage, Error, InfiniteData<TPage, number>, QueryKey, number> & { queryKey: QueryKey }
}

export function useAdminInfiniteList<TInput, TPage extends AdminListPageShape, TRow>({
  namespace,
  pageSize,
  buildInput,
  selectRows,
  noun,
  enabled = true,
  refetchInterval,
}: {
  namespace: AdminInfiniteListSource<TInput, TPage>
  pageSize: number
  buildInput: (offset: number) => TInput
  selectRows: (page: TPage) => TRow[]
  noun?: UiMessageId
  enabled?: boolean
  refetchInterval?: number
}) {
  const { t } = useI18n()
  const options = namespace.infiniteOptions({
    input: buildInput,
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => (lastPage.hasMore ? lastPageParam + pageSize : undefined),
    enabled,
    refetchInterval,
  })
  const listQuery = useInfiniteQuery(options)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery

  const pages = listQuery.data?.pages ?? []
  const rows = pages.flatMap((page) => selectRows(page))
  const firstPage = pages[0]
  const total = firstPage?.total ?? 0

  useEffect(() => {
    if (noun && listQuery.error) {
      toastApiError(listQuery.error, 'admin.toast.listLoadFailed', t, { noun: t(noun) })
    }
  }, [listQuery.error, noun, t])

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    tailKey: rows.length,
  })

  const queryClient = useQueryClient()
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
    pages,
    firstPage,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    sentinelRef,
    patchPages,
    reset,
  }
}
