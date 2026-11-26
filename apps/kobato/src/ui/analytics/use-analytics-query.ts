export interface AnalyticsQuerySlice<T> {
  data: T | null
  hasLoaded: boolean
  isError: boolean
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
