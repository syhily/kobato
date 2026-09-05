import React from 'react'

import EarthIcon from '@/assets/icons/inkling-earth.svg?react'
import { createRequestTrack, type RequestScheduler } from '@/utils/services/request-track'
import { runTrackedRequest } from '@/utils/services/service-machine'
import { createSnapshotStore } from '@/utils/services/snapshot-store'

// Search coordinator — the headless module owning the link-search flow behind
// useSearchLinks: two request tracks (the debounced query search and the
// default-options prefetch, both composed from the request-track primitives
// in src/utils/services/request-track.ts), the URL short-circuit, and the
// cross-track waiting. The churn (stale responses, superseded queries,
// rejections, cancellation) lives here behind injected ports — the scheduler
// and the searchLinks promise factory — so the race matrix is a synchronous
// test table instead of renderHook + wall-clock sleeps. The query track's
// async core is the shared tracked-request skeleton
// (src/utils/services/service-machine.ts); the surface stays method-style
// (setQuery/start) rather than the dispatch protocol — a lifecycle `start`
// is not an intent. The React adapter is useSearchLinks (~40 lines):
// position and constraints in, a snapshot out.

export const SEARCH_DEBOUNCE_MS = 100

// A third URL table, deliberately not unified with either side of the
// clipboard protocol's policy pair: it classifies link-search-box queries
// (accepts mailto/tel, not ftp), not pasted links (`isPasteableLinkUrl` in
// `@/plugins/behaviour/clipboard-protocol`) or export-safe hrefs (`isSafeUrl`
// in `@/nodes/base/utils/is-safe-url`).
const URL_QUERY_REGEX = /^http|^#|^\/|^mailto:|^tel:/

// English fallbacks for the URL option — the React adapter (useSearchLinks)
// injects the resolved labels from the host's labels table; the headless
// module stays self-sufficient with these.
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
  if (!results || !results.length) {
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

/** Scheduler port for the debounced query track — an alias of the request track's `RequestScheduler`. */
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

  // the coordinator's own no-results fallback, carrying the injected (or
  // English-default) URL option labels
  const fallbackNoResultOptions = noResultOptions ?? (() => defaultNoResultOptions(urlOptionLabel, urlOptionHint))

  // query track (debounced) and default (prefetch) track — the latest-wins
  // guards are the shared request-track primitive
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

    // undefined means the search was cancelled (or a newer query superseded
    // this one): keep the current options instead of flashing "no results"
    // while a later search is in flight. A rejection is best-effort too —
    // preserve the last options. Either way the latest request always
    // leaves the searching state.
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
        // Default suggestions are best-effort.
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

      // URL queries skip the debounced search so the "Link to web page"
      // option updates more responsively
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

    /** Begin the default-options prefetch (adapter mount). */
    start() {
      defaultOptionsLoaded = false
      void startDefaultOptionsFetch()
    },

    /** Invalidate every in-flight request (adapter unmount / recreation) and drop the store's listeners. */
    dispose() {
      queryTrack.dispose()
      defaultTrack.dispose()
      defaultRequest = null
      store.dispose()
    },
  }
}

export type SearchCoordinator = ReturnType<typeof createSearchCoordinator>
