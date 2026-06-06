import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type SearchComponentId = string & { __brand: 'SearchComponentId' }

export function createSearchComponentId(base: string, unique: string): SearchComponentId {
  return `${base}-${unique}` as SearchComponentId
}

// Split Context: high-frequency filter state vs low-frequency search API.
// Prevents every nav item from re-rendering on each keystroke — only
// components that read `filter` / `setFilter` subscribe to the volatile
// Context; the rest read from the stable API Context.

interface FilterState {
  filter: string
  setFilter: (value: string) => void
}

const FilterContext = createContext<FilterState>({
  filter: '',
  setFilter: () => {
    /* noop */
  },
})

interface SearchApiState {
  checkVisible: (keywords: string[]) => boolean
  highlightKeywords: (text: ReactNode) => ReactNode
  noResult: boolean
  setNoResult: (value: boolean) => void
  registerComponent: (id: SearchComponentId, keywords: string[]) => void
  unregisterComponent: (id: SearchComponentId) => void
  getVisibleComponents: () => Set<SearchComponentId>
  isOnlyVisibleComponent: (id: SearchComponentId) => boolean
}

const SearchApiContext = createContext<SearchApiState>({
  checkVisible: () => true,
  highlightKeywords: (text) => text,
  noResult: false,
  setNoResult: () => {
    /* noop */
  },
  registerComponent: () => {
    /* noop */
  },
  unregisterComponent: () => {
    /* noop */
  },
  getVisibleComponents: () => new Set<SearchComponentId>(),
  isOnlyVisibleComponent: () => false,
})

export function SettingsSearchProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState('')
  const [noResult, setNoResult] = useState(false)
  const registeredComponents = useRef<Map<SearchComponentId, string[]>>(new Map())
  const [visibleComponents, setVisibleComponents] = useState<Set<SearchComponentId>>(new Set())

  const checkVisible = useCallback(
    (keywords: string[]) => {
      if (!keywords.length || !filter) {
        return true
      }
      const lowerFilter = filter.toLowerCase()
      return keywords.some((keyword) => keyword.toLowerCase().includes(lowerFilter))
    },
    [filter],
  )

  const registerComponent = useCallback(
    (id: SearchComponentId, keywords: string[]) => {
      registeredComponents.current.set(id, keywords)
      const isVisible = !filter || keywords.some((keyword) => keyword.toLowerCase().includes(filter.toLowerCase()))
      if (isVisible) {
        setVisibleComponents((prev) => new Set(prev).add(id))
      }
    },
    [filter],
  )

  const unregisterComponent = useCallback((id: SearchComponentId) => {
    registeredComponents.current.delete(id)
    setVisibleComponents((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  useEffect(() => {
    const newVisible = new Set<SearchComponentId>()
    const lowerFilter = filter.toLowerCase()
    registeredComponents.current.forEach((keywords, id) => {
      const isVisible = !filter || keywords.some((keyword) => keyword.toLowerCase().includes(lowerFilter))
      if (isVisible) {
        newVisible.add(id)
      }
    })
    setVisibleComponents(newVisible)
  }, [filter])

  const isOnlyVisibleComponent = useCallback(
    (id: SearchComponentId) => {
      return visibleComponents.size === 1 && visibleComponents.has(id)
    },
    [visibleComponents],
  )

  const getVisibleComponents = useCallback(() => {
    return visibleComponents
  }, [visibleComponents])

  const highlightKeywords = useMemo(() => {
    if (!filter) {
      return (text: ReactNode): ReactNode => text
    }
    const words = filter.split(/\s+/).map((word) => word.toLowerCase())
    const wordsPattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const regex = new RegExp(`(${wordsPattern})`, 'gi')
    return (text: ReactNode): ReactNode => {
      if (typeof text === 'string') {
        const parts = text.split(regex)
        return parts.reduce<ReactNode[]>((result, part) => {
          if (words.includes(part.toLowerCase())) {
            result.push(
              <mark key={`mark-${result.length}`} className="rounded-sm bg-yellow-500/40">
                {part}
              </mark>,
            )
          } else {
            result.push(part)
          }
          return result
        }, [])
      }
      if (Array.isArray(text)) {
        return text.reduce<ReactNode[]>((result, part) => {
          result.push(<span key={`span-${result.length}`}>{highlightKeywords(part)}</span>)
          return result
        }, [])
      }
      return text
    }
  }, [filter])

  const filterState = useMemo(() => ({ filter, setFilter }), [filter])
  const apiState = useMemo(
    () => ({
      checkVisible,
      highlightKeywords,
      noResult,
      setNoResult,
      registerComponent,
      unregisterComponent,
      getVisibleComponents,
      isOnlyVisibleComponent,
    }),
    [
      checkVisible,
      highlightKeywords,
      noResult,
      registerComponent,
      unregisterComponent,
      getVisibleComponents,
      isOnlyVisibleComponent,
    ],
  )

  return (
    <FilterContext.Provider value={filterState}>
      <SearchApiContext.Provider value={apiState}>{children}</SearchApiContext.Provider>
    </FilterContext.Provider>
  )
}

export function useSettingsSearchFilter() {
  return useContext(FilterContext)
}

export function useSettingsSearch() {
  return useContext(SearchApiContext)
}

export function useSettingsSearchContext() {
  return { ...useContext(FilterContext), ...useContext(SearchApiContext) }
}
