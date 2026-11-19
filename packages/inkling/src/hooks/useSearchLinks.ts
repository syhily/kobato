import {
  createSearchCoordinator,
  type ListOptionSection,
  type SearchLinksFn,
} from '@kobato/inkling-internal/hooks/search-coordinator'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import React from 'react'

export type {
  ListOptionItem,
  ListOptionSection,
  SearchLinksFn,
  SearchResult,
} from '@kobato/inkling-internal/hooks/search-coordinator'

interface UseSearchLinksOptions {
  noResultOptions?: (query: string) => ListOptionSection[]
}

interface UseSearchLinksResult {
  isSearching: boolean
  listOptions: ListOptionSection[]
}

export const useSearchLinks = (
  query: string,
  searchLinks?: SearchLinksFn,
  { noResultOptions }: UseSearchLinksOptions = {},
): UseSearchLinksResult => {
  const labels = useInklingLabels()
  const coordinator = React.useMemo(
    () =>
      createSearchCoordinator({
        searchLinks,
        noResultOptions,
        urlOptionLabel: labels['search.urlOption.label'],
        urlOptionHint: labels['search.urlOption.hint'],
      }),
    [searchLinks, noResultOptions, labels],
  )

  React.useEffect(() => {
    coordinator.start()
    return () => {
      coordinator.dispose()
    }
  }, [coordinator])

  React.useEffect(() => {
    coordinator.setQuery(query)
  }, [coordinator, query])

  const snapshot = React.useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot)

  return {
    isSearching: snapshot.isSearching,
    listOptions: query ? snapshot.listOptions : snapshot.defaultListOptions,
  }
}
