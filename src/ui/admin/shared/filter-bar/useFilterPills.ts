import { useQueries } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { TextFilterValue } from '@/ui/admin/shared/filter-bar/text-filter'
import type {
  FilterFieldSpec,
  FilterOptionItem,
  FilterPillBarProps,
  FilterQueryPatch,
  SearchFieldState,
  SearchFilterField,
} from '@/ui/admin/shared/filter-bar/types'
import type { ActiveFilter, FilterPillsAction } from '@/ui/admin/shared/filterPillsReducer'

import { unsafeCast } from '@/shared/utils/unsafe-cast'
import {
  type DateFilterValue,
  parseDateFilter,
  parseSingleDateFilter,
  type SingleDateFilterValue,
} from '@/ui/admin/shared/date-filter'
import { parseTextFilterValue } from '@/ui/admin/shared/filter-bar/text-filter'
import { filterPillsReducer } from '@/ui/admin/shared/filterPillsReducer'

const SEARCH_DEBOUNCE_MS = 250

export interface UseFilterPillsOptions<K extends string> {
  /** Field specs — stable identity (module-scope constant or memoized). */
  fields: readonly FilterFieldSpec<K>[]
  /** Uncontrolled seed (comments: the URL-restored pills). */
  initial?: ActiveFilter<K>[]
  /** Controlled value (my-comments: pills derived from the URL — the URL
   *  stays the source of truth and is adopted whenever it changes). */
  value?: ActiveFilter<K>[]
  /** Controlled sink — fired after every state-changing dispatch with the
   *  resulting filters and the action that produced them. */
  onChange?: (next: ActiveFilter<K>[], action: FilterPillsAction<K>) => void
}

interface PillsState<K extends string> {
  filters: ActiveFilter<K>[]
  /** The dispatch that produced `filters` — null for seeds and controlled
   *  resyncs so `onChange` only fires for genuine local dispatches. */
  action: FilterPillsAction<K> | null
}

/**
 * The shared filter-pill state hook behind `<FilterPillBar>`. Owns the
 * reducer (one pill per field), the per-search-field debounced server
 * search (react-query `useQueries`), label rehydration for URL-restored
 * pills (`resolveOptions` → an internal `renameFilter`), every value codec
 * (text `{op,value}`, date-single `{date,op}`, date-range `{from,to}` —
 * malformed JSON falls back to the editor default and never throws), and
 * the `queryInput()` merge that maps active pills onto the list query.
 */
export function useFilterPills<K extends string>({ fields, initial, value, onChange }: UseFilterPillsOptions<K>) {
  const controlled = value !== undefined
  const [state, setState] = useState<PillsState<K>>({ filters: initial ?? value ?? [], action: null })
  const filters = state.filters

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Controlled resync: adopt the external value whenever it meaningfully
  // changes (the URL re-validated). Content-equal rebuilds (a fresh array
  // identity with the same pills) are ignored so transient local pills —
  // e.g. an empty text pill, which maps to q: null — survive unrelated
  // re-renders; they are dropped only when the URL genuinely re-validates.
  const [lastValue, setLastValue] = useState(value)
  if (controlled && value !== lastValue && !sameFilters(value, lastValue)) {
    setLastValue(value)
    setState({ filters: value, action: null })
  }

  const dispatch = useCallback((action: FilterPillsAction<K>) => {
    setState((prev) => {
      const next = filterPillsReducer(prev.filters, action)
      return next === prev.filters ? prev : { filters: next, action }
    })
  }, [])

  // Notify the controlled sink once per produced state — identity-guarded
  // so unrelated re-renders never re-fire it.
  const notifiedRef = useRef<PillsState<K> | null>(null)
  useEffect(() => {
    if (state.action && notifiedRef.current !== state) {
      notifiedRef.current = state
      onChangeRef.current?.(state.filters, state.action)
    }
  })

  // --- async search fields ------------------------------------------------

  const searchFields = useMemo(() => fields.filter((f): f is SearchFilterField<K> => f.kind === 'search'), [fields])

  const [searchInputs, setSearchInputs] = useState<Partial<Record<K, string>>>({})
  const [debouncedInputs, setDebouncedInputs] = useState(searchInputs)
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedInputs(searchInputs), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [searchInputs])

  const searchResults = useQueries({
    queries: searchFields.map((field) => field.queryOptions(debouncedInputs[field.key] ?? '')),
  })

  const resolveResults = useQueries({
    queries: searchFields.map((field) => {
      const active = filters.find((f) => f.field === field.key)
      return field.resolveOptions && active
        ? field.resolveOptions(active.value)
        : { queryKey: ['filter-bar', 'resolve', field.key] as const, enabled: false }
    }),
  })

  // Label rehydration: a URL-restored pill carries the raw value as its
  // label; once the resolve query lands, rename it to the human label.
  // Guarded on inequality so a resolved pill never re-dispatches.
  useEffect(() => {
    searchFields.forEach((field, i) => {
      if (!field.resolveOptions) {
        return
      }
      const active = filters.find((f) => f.field === field.key)
      if (!active) {
        return
      }
      const data: unknown = resolveResults[i]?.data
      if (data === undefined || data === null) {
        return
      }
      const item = field.select(data)[0]
      if (item && item.label !== active.label) {
        dispatch({ type: 'renameFilter', field: field.key, label: item.label })
      }
    })
  })

  const search = useMemo(() => {
    const out: Partial<Record<K, SearchFieldState>> = {}
    searchFields.forEach((field, i) => {
      const result = searchResults[i]
      const debounced = debouncedInputs[field.key] ?? ''
      // While a search query is active but its results haven't landed, the
      // list stays empty (加载中… shows); with no active query, fall back to
      // the spec's initial items (loader-provided lists).
      const items: FilterOptionItem[] =
        result?.data != null ? field.select(result.data) : debounced ? [] : [...(field.initialItems ?? [])]
      // Pin the selected value into the items so the trigger always
      // resolves its label, even when it isn't in the fetched window.
      const active = filters.find((f) => f.field === field.key)
      if (active && !items.some((item) => item.value === active.value)) {
        items.unshift({ value: active.value, label: active.label })
      }
      out[field.key] = {
        items,
        isPending: result?.isPending ?? false,
        setQuery: (query: string) => setSearchInputs((prev) => ({ ...prev, [field.key]: query })),
      }
    })
    return out
  }, [searchFields, searchResults, debouncedInputs, filters])

  // --- query input + typed accessors --------------------------------------

  const queryInput = useCallback(<TQuery extends object = Record<string, string>>(): TQuery => {
    const out: Record<string, string> = {}
    for (const filter of filters) {
      const field = fields.find((f) => f.key === filter.field)
      if (!field) {
        continue
      }
      const patch = resolveFieldQueryPatch(field, filter.value)
      for (const [key, patchValue] of Object.entries(patch)) {
        if (patchValue !== undefined) {
          out[key] = patchValue
        }
      }
    }
    // The per-field `toQuery` patches are key-disjoint by convention, so
    // the merge is exactly the domain's query-input shape.
    return unsafeCast<TQuery>(out)
  }, [fields, filters])

  const text = useCallback(
    (key: K): TextFilterValue => {
      const field = fields.find((f) => f.key === key)
      const operators = field?.kind === 'text' ? field.operators : []
      const filter = filters.find((f) => f.field === key)
      const parsed = filter ? parseTextFilterValue(filter.value, operators) : null
      return parsed ?? { op: operators[0]?.value ?? '', value: '' }
    },
    [fields, filters],
  )

  const dateSingle = useCallback(
    (key: K): SingleDateFilterValue | null => {
      const filter = filters.find((f) => f.field === key)
      return filter ? parseSingleDateFilter(filter.value) : null
    },
    [filters],
  )

  const dateRange = useCallback(
    (key: K): DateFilterValue | null => {
      const filter = filters.find((f) => f.field === key)
      return filter ? parseDateFilter(filter.value) : null
    },
    [filters],
  )

  const bar = useMemo<FilterPillBarProps<K>>(
    () => ({
      fields,
      filters,
      search,
      onAddFilter: (field, value, label) => dispatch({ type: 'addFilter', field, value, label }),
      onRemoveFilter: (field) => dispatch({ type: 'removeFilter', field }),
      onClearFilters: () => dispatch({ type: 'clearFilters' }),
    }),
    [fields, filters, search, dispatch],
  )

  return { filters, hasFilters: filters.length > 0, dispatch, queryInput, text, dateSingle, dateRange, bar }
}

/** Content equality for the controlled resync guard — the pill lists the
 *  URL derivation rebuilds are small, so a pairwise compare is cheap. */
function sameFilters<K extends string>(a: ActiveFilter<K>[] | undefined, b: ActiveFilter<K>[] | undefined): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.length !== b.length) {
    return false
  }
  return a.every((filter, i) => {
    const other = b[i]
    return (
      other !== undefined &&
      filter.field === other.field &&
      filter.value === other.value &&
      filter.label === other.label
    )
  })
}

/** Decode a pill value through its field's codec and map it onto the query
 *  patch. Undecodable values (malformed JSON, empty dates) contribute
 *  nothing — a freshly added empty pill is a query no-op. */
function resolveFieldQueryPatch<K extends string>(field: FilterFieldSpec<K>, raw: string): FilterQueryPatch {
  switch (field.kind) {
    case 'text': {
      const parsed = parseTextFilterValue(raw, field.operators)
      return parsed ? field.toQuery(parsed) : {}
    }
    case 'date-single': {
      const parsed = parseSingleDateFilter(raw)
      return parsed ? field.toQuery(parsed) : {}
    }
    case 'date-range': {
      const parsed = parseDateFilter(raw)
      return parsed ? field.toQuery(parsed) : {}
    }
    case 'options':
    case 'search':
    case 'freetext':
      return field.toQuery(raw)
  }
}
