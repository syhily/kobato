import EarthIcon from '@kobato/inkling-internal/assets/icons/inkling-earth.svg?react'
import { createRequestTrack, type RequestScheduler } from '@kobato/inkling-internal/services/request-track'
import { runTrackedRequest } from '@kobato/inkling-internal/services/service-machine'
import { createSnapshotStore } from '@kobato/inkling-internal/services/snapshot-store'
import React from 'react'

export const SEARCH_DEBOUNCE_MS = 100
// A third URL table, deliberately not unified with either side of the
// clipboard protocol's policy pair: it classifies link-search-box queries
// (accepts mailto/tel, not ftp), not pasted links (`isPasteableLinkUrl` in
// `@kobato/inkling-internal/plugins/behaviour/clipboard-protocol`) or export-safe hrefs (`isSafeUrl`
// in `@kobato/inkling-internal/nodes/base/utils/is-safe-url`).
const URL_QUERY_REGEX = /^http|^#|^\/|^mailto:|^tel:/

const DEFAULT_URL_OPTION_LABEL = 'Link to web page'
const DEFAULT_URL_OPTION_HINT = 'Enter URL to create link'

export interface ListOptionItem {
  label: string
  value: string | null
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  highlight: boolean
  type: string
  metaText?: string
  MetaIcon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  metaIconTitle?: string
}

export interface ListOptionSection {
  label: string
  items: ListOptionItem[]
}

export interface SearchResult {
  label: string
  items: Array<{
    title: string
    url: string
    Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
    metaText?: string
    MetaIcon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
    metaIconTitle?: string
  }>
}

export type SearchLinksFn = (term?: string) => Promise<SearchResult[] | undefined>

function urlQueryOptions(query: string, sectionLabel: string): ListOptionSection[] {
  return [
    {
      label: sectionLabel,
      items: [
        {
          label: query,
          value: query,
          Icon: EarthIcon,
          highlight: false,
          type: 'url',
        },
      ],
    },
  ]
}

function defaultNoResultOptions(sectionLabel: string, hintLabel: string): ListOptionSection[] {
  return [
    {
      label: sectionLabel,
      items: [
        {
          label: hintLabel,
          value: null,
          Icon: EarthIcon,
          highlight: false,
          type: 'no-results',
        },
      ],
    },
  ]
}

function convertSearchResultsToListOptions(
  results: SearchResult[] | undefined,
  query: string,
  { noResultOptions, type }: { noResultOptions: (query: string) => ListOptionSection[]; type?: string },
): ListOptionSection[] {
  if (!results?.length) {
    return noResultOptions(query)
  }

  return results.map((result) => {
    const items: ListOptionItem[] = result.items.map((item) => {
      return {
        label: item.title,
        value: item.url,
        Icon: item.Icon ?? EarthIcon,
        highlight: type !== 'default',
        metaText: item.metaText,
        MetaIcon: item.MetaIcon,
        metaIconTitle: item.metaIconTitle,
        type: type || 'internal',
      }
    })

    return { ...result, items }
  })
}

export interface SearchCoordinatorSnapshot {
  isSearching: boolean
  listOptions: ListOptionSection[]
  defaultListOptions: ListOptionSection[]
}

export type SearchScheduler = RequestScheduler

interface CreateSearchCoordinatorOptions {
  searchLinks?: SearchLinksFn
  noResultOptions?: (query: string) => ListOptionSection[]
  scheduler?: SearchScheduler
  debounceMs?: number
  urlOptionLabel?: string
  urlOptionHint?: string
}

export function createSearchCoordinator({
  searchLinks,
  noResultOptions,
  scheduler,
  debounceMs = SEARCH_DEBOUNCE_MS,
  urlOptionLabel = DEFAULT_URL_OPTION_LABEL,
  urlOptionHint = DEFAULT_URL_OPTION_HINT,
}: CreateSearchCoordinatorOptions) {
  const store = createSnapshotStore<SearchCoordinatorSnapshot>({
    isSearching: false,
    listOptions: [],
    defaultListOptions: [],
  })

  const fallbackNoResultOptions = noResultOptions ?? (() => defaultNoResultOptions(urlOptionLabel, urlOptionHint))

  const queryTrack = createRequestTrack({ scheduler })
  const defaultTrack = createRequestTrack()
  let defaultRequest: { id: number; promise: Promise<void> } | null = null
  let defaultOptionsLoaded = false

  const runSearch = async (id: number, term: string): Promise<void> => {
    // a scheduled dispatch that fires after a newer query never starts —
    // the newer request owns the searching flag
    if (!queryTrack.isLatest(id)) {
      return
    }

    store.emit({ isSearching: true })

    // a missing search function resolves like a cancelled search: keep the
    // current options and leave the searching state
    const outcome = await runTrackedRequest(queryTrack, id, () =>
      searchLinks ? searchLinks(term) : Promise.resolve(undefined),
    )

    // undefined means cancelled or superseded: keep the current options instead
    // of flashing "no results" while a later search is in flight. A rejection is
    // best-effort too — preserve the last options. Either way the latest request
    // always leaves the searching state.
    if (outcome?.ok && outcome.value !== undefined) {
      store.emit({
        listOptions: convertSearchResultsToListOptions(outcome.value, term, {
          noResultOptions: fallbackNoResultOptions,
        }),
      })
    }
    if (outcome) {
      store.emit({ isSearching: false })
    }
  }

  const startDefaultOptionsFetch = (): Promise<void> => {
    const id = defaultTrack.next()
    const promise = (async () => {
      try {
        const results = searchLinks ? await searchLinks() : undefined
        if (defaultTrack.isLatest(id)) {
          defaultOptionsLoaded = true
          store.emit({
            defaultListOptions: convertSearchResultsToListOptions(results, '', {
              noResultOptions: fallbackNoResultOptions,
              type: 'default',
            }),
          })
        }
      } catch {
        /* noop */
      }
    })()

    defaultRequest = { id, promise }
    void promise.then(() => {
      if (defaultRequest?.id === id) {
        defaultRequest = null
      }
    })
    return promise
  }

  const waitForDefaultOptions = (): Promise<void> => {
    if (defaultOptionsLoaded) {
      return Promise.resolve()
    }
    return defaultRequest?.promise ?? startDefaultOptionsFetch()
  }

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,

    setQuery(query: string) {
      const requestId = queryTrack.next()

      if (URL_QUERY_REGEX.test(query)) {
        queryTrack.cancelScheduled()
        store.emit({ listOptions: urlQueryOptions(query, urlOptionLabel), isSearching: false })
        return
      }

      if (!query) {
        queryTrack.cancelScheduled()
        if (defaultOptionsLoaded) {
          store.emit({ isSearching: false })
        } else {
          store.emit({ isSearching: true })
          void waitForDefaultOptions().then(() => {
            if (queryTrack.isLatest(requestId)) {
              store.emit({ isSearching: false })
            }
          })
        }
        return
      }

      queryTrack.schedule(() => void runSearch(requestId, query), debounceMs)
    },

    start() {
      defaultOptionsLoaded = false
      void startDefaultOptionsFetch()
    },

    dispose() {
      queryTrack.dispose()
      defaultTrack.dispose()
      defaultRequest = null
      store.dispose()
    },
  }
}

export type SearchCoordinator = ReturnType<typeof createSearchCoordinator>
