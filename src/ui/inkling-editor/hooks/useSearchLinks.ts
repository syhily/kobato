import debounce from 'lodash/debounce'
import React from 'react'

import EarthIcon from '@/ui/inkling-editor/assets/icons/inkling-earth.svg?react'

const DEBOUNCE_MS = 100
const URL_QUERY_REGEX = /^http|^#|^\/|^mailto:|^tel:/

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

function urlQueryOptions(query: string): ListOptionSection[] {
  return [
    {
      label: 'Link to web page',
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

function defaultNoResultOptions(query: string): ListOptionSection[] {
  return [
    {
      label: 'Link to web page',
      items: [
        {
          label: `Enter URL to create link`,
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
  { noResultOptions, type }: { noResultOptions?: (query: string) => ListOptionSection[]; type?: string } = {},
): ListOptionSection[] {
  if (!results || !results.length) {
    return (noResultOptions || defaultNoResultOptions)('')
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

type SearchLinksFn = (term?: string) => Promise<SearchResult[] | undefined>

interface UseSearchLinksOptions {
  noResultOptions?: (query: string) => ListOptionSection[]
}

interface UseSearchLinksResult {
  isSearching: boolean
  listOptions: ListOptionSection[]
}

export const useSearchLinks = (
  query: string,
  searchLinks: SearchLinksFn,
  { noResultOptions }: UseSearchLinksOptions = {},
): UseSearchLinksResult => {
  const [defaultListOptions, setDefaultListOptions] = React.useState<ListOptionSection[]>([])
  const [listOptions, setListOptions] = React.useState<ListOptionSection[]>([])
  const [isSearching, setIsSearching] = React.useState<boolean>(false)

  const search = React.useMemo(() => {
    return async function _search(term: string): Promise<void> {
      if (URL_QUERY_REGEX.test(term)) {
        setListOptions(urlQueryOptions(term))
        return
      }

      setIsSearching(true)
      const results = await searchLinks(term)

      // can return undefined if the search was cancelled, avoid updating
      // in that scenario because we can end up in a race condition where
      // we overwrite the results with an empty array whilst still waiting
      // for a later search to complete. Avoids flashing of "no results".
      if (results === undefined) {
        return
      }

      setListOptions(convertSearchResultsToListOptions(results, { noResultOptions }))
      setIsSearching(false)
    }
  }, [searchLinks, noResultOptions])

  const debouncedSearch = React.useMemo(() => {
    return debounce(search, DEBOUNCE_MS)
  }, [search])

  // Fetch default search results when first rendering
  React.useEffect(() => {
    const fetchDefaultOptions = async () => {
      // if we have a query we don't want to show the searching state but
      // we still want to load the default options in the background so
      // they're available when the query is cleared
      if (!query) {
        setIsSearching(true)
      }
      const results = await searchLinks()
      setDefaultListOptions(convertSearchResultsToListOptions(results, { type: 'default' }))
      if (!query) {
        setIsSearching(false)
      }
    }

    fetchDefaultOptions().catch(() => {
      // best-effort; defaults already applied
    })
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    // perform a non-debounced search if the query is a URL so the
    // "Link to web page" option updates more responsively
    if (URL_QUERY_REGEX.test(query)) {
      debouncedSearch.cancel()
      search(query)
    } else {
      debouncedSearch(query)
    }
  }, [query, search, debouncedSearch])

  const displayedListOptions = query ? listOptions : defaultListOptions

  return {
    isSearching,
    listOptions: displayedListOptions,
  }
}
