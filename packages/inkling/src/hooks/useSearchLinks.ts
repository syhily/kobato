import React from 'react'

import { createSearchCoordinator, type ListOptionSection, type SearchLinksFn } from '@/hooks/search-coordinator'
import { useInklingLabels } from '@/hooks/useInklingLabels'

// React adapter over @/hooks/search-coordinator (the deep module — request
// tracks, URL short-circuit, and race policy live there). The coordinator is
// recreated when the search function or options change, which both restarts
// the default prefetch and re-issues the current query, matching the previous
// effect-per-input wiring. The labels table's URL-option strings are resolved
// here and injected into the coordinator, which keeps its own English
// fallbacks for headless consumers.

export type { ListOptionItem, ListOptionSection, SearchLinksFn, SearchResult } from '@/hooks/search-coordinator'

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

  // the coordinator's subscribe/getSnapshot are closure-bound, so they ride
  // useSyncExternalStore directly — a recreated coordinator re-subscribes
  const snapshot = React.useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot)

  return {
    isSearching: snapshot.isSearching,
    listOptions: query ? snapshot.listOptions : snapshot.defaultListOptions,
  }
}
