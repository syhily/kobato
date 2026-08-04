import {
  type SessionSortOption,
  type SessionSortState,
  parseSessionSort,
  serializeSessionSort,
} from '@kobato/shared/utils/sessions-sort'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

interface UseSessionSortOptions<T extends string> {
  defaultSort?: T
  sortOptions: SessionSortOption<T>[]
}

export function useSessionSort<T extends string>({ defaultSort, sortOptions }: UseSessionSortOptions<T>) {
  const [searchParams, setSearchParams] = useSearchParams()

  const sort = useMemo(
    () => parseSessionSort(searchParams.get('sort'), sortOptions, defaultSort ?? sortOptions[0]!.value),
    [searchParams, sortOptions, defaultSort],
  )

  const defaultSortState = useMemo<SessionSortState<T>>(() => {
    const field = defaultSort ?? sortOptions[0]!.value
    const option = sortOptions.find((o) => o.value === field) ?? sortOptions[0]!
    return { field, direction: option.defaultDirection }
  }, [defaultSort, sortOptions])

  const setSort = useCallback(
    (next: SessionSortState<T>) => {
      const nextParams = new URLSearchParams(searchParams)
      const serialized = serializeSessionSort(next, sortOptions)
      if (serialized === serializeSessionSort(defaultSortState, sortOptions)) {
        nextParams.delete('sort')
      } else {
        nextParams.set('sort', serialized)
      }
      setSearchParams(nextParams, { replace: false })
    },
    [searchParams, setSearchParams, sortOptions, defaultSortState],
  )

  return {
    sort,
    setSort,
  }
}
