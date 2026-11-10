export interface AnalyticsQuerySlice<T> {
  /** Resolved rows: the client query's data, else the loader fallback, else null. */
  data: T | null
  hasLoaded: boolean
  /** True only when the query failed AND there is nothing to show. */
  isError: boolean
  /** Fetching with loaded data — dim the content instead of re-skeletoning. */
  refetching: boolean
  isFetching: boolean
  retry: () => void
}

interface AnalyticsQueryLike<T> {
  data: T | undefined
  isError: boolean
  isFetching: boolean
  refetch: () => Promise<unknown>
}

export function useAnalyticsQueryData<T>(query: AnalyticsQueryLike<T>, initial?: T | null): AnalyticsQuerySlice<T> {
  const data = query.data ?? initial ?? null
  const hasLoaded = data !== null
  return {
    data,
    hasLoaded,
    isError: query.isError && !hasLoaded,
    refetching: query.isFetching && hasLoaded,
    isFetching: query.isFetching,
    retry: () => void query.refetch(),
  }
}
