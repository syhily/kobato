import { type ReactNode, createContext, use, useCallback, useMemo, useState } from 'react'

function highlightTextArray(text: string, regex: RegExp, words: string[]): ReactNode[] {
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

function highlightNodeList(text: ReactNode[], regex: RegExp, words: string[]): ReactNode[] {
  return text.reduce<ReactNode[]>((result, part) => {
    result.push(<span key={`span-${result.length}`}>{highlightNode(part, regex, words)}</span>)
    return result
  }, [])
}

function highlightNode(text: ReactNode, regex: RegExp, words: string[]): ReactNode {
  if (typeof text === 'string') {
    return highlightTextArray(text, regex, words)
  }
  if (isReactNodeArray(text)) {
    return highlightNodeList(text, regex, words)
  }
  return text
}

function isReactNodeArray(value: unknown): value is ReactNode[] {
  return Array.isArray(value)
}

export type SearchComponentId = string

export function createSearchComponentId(base: string, unique: string): SearchComponentId {
  return `${base}-${unique}`
}

// Split Context: high-frequency filter state vs low-frequency search API, so
// nav items don't re-render on each keystroke — only components reading
// `filter` / `setFilter` subscribe to the volatile Context.

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
  const [registeredComponents, setRegisteredComponents] = useState<Map<SearchComponentId, string[]>>(() => new Map())

  // Derive visible components purely from registered + filter, no effect.
  const visibleComponents = useMemo(() => {
    const newVisible = new Set<SearchComponentId>()
    const lowerFilter = filter.toLowerCase()
    registeredComponents.forEach((keywords, id) => {
      const isVisible = !filter || keywords.some((keyword) => keyword.toLowerCase().includes(lowerFilter))
      if (isVisible) {
        newVisible.add(id)
      }
    })
    return newVisible
  }, [filter, registeredComponents])

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

  const registerComponent = useCallback((id: SearchComponentId, keywords: string[]) => {
    setRegisteredComponents((prev) => {
      const next = new Map(prev)
      next.set(id, keywords)
      return next
    })
  }, [])

  const unregisterComponent = useCallback((id: SearchComponentId) => {
    setRegisteredComponents((prev) => {
      if (!prev.has(id)) {
        return prev
      }
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const isOnlyVisibleComponent = useCallback(
    (id: SearchComponentId) => {
      return visibleComponents.size === 1 && visibleComponents.has(id)
    },
    [visibleComponents],
  )

  const getVisibleComponents = useCallback(() => {
    return visibleComponents
  }, [visibleComponents])

  const highlightKeywords = useCallback(
    (text: ReactNode): ReactNode => {
      if (!filter) {
        return text
      }
      const words = filter.split(/\s+/).map((word) => word.toLowerCase())
      const wordsPattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
      const regex = new RegExp(`(${wordsPattern})`, 'gi')
      return highlightNode(text, regex, words)
    },
    [filter],
  )

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
    <FilterContext value={filterState}>
      <SearchApiContext value={apiState}>{children}</SearchApiContext>
    </FilterContext>
  )
}

export function useSettingsSearchFilter() {
  return use(FilterContext)
}

export function useSettingsSearch() {
  return use(SearchApiContext)
}

export function useSettingsSearchContext() {
  return { ...use(FilterContext), ...use(SearchApiContext) }
}
