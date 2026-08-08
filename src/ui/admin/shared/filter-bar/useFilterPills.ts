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
  /** Controlled value — the URL stays the source of truth, adopted on change. */
  value?: ActiveFilter<K>[]
  /** Controlled sink — fired after every state-changing dispatch with the resulting filters and action. */
  onChange?: (next: ActiveFilter<K>[], action: FilterPillsAction<K>) => void
}

interface PillsState<K extends string> {
  filters: ActiveFilter<K>[]
  /** The dispatch that produced `filters` — null for seeds and controlled resyncs, so `onChange` fires only for local dispatches. */
  action: FilterPillsAction<K> | null
}

/**
 * Shared filter-pill state behind `<FilterPillBar>`: reducer, per-search-field
 * debounced server search, label rehydration, value codecs (malformed JSON
 * falls back to the editor default and never throws), and the `queryInput()` merge.
 */
export function useFilterPills<K extends string>({ fields, initial, value, onChange }: UseFilterPillsOptions<K>) {
  const controlled = value !== undefined
  const [state, setState] = useState<PillsState<K>>({ filters: initial ?? value ?? [], action: null })
  const filters = state.filters

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Controlled resync: adopt the external value when it meaningfully changes;
  // content-equal rebuilds are ignored so transient local pills survive.
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

  // Notify the controlled sink once per produced state — identity-guarded.
  const notifiedRef = useRef<PillsState<K> | null>(null)
  useEffect(() => {
    if (state.action && notifiedRef.current !== state) {
      notifiedRef.current = state
      onChangeRef.current?.(state.filters, state.action)
    }
  })

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

  // Label rehydration: rename a URL-restored pill to its human label once the
  // resolve query lands; guarded on inequality so it never re-dispatches.
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
      // Active search query without results yet → empty list; no query → the spec's initial items.
      const items: FilterOptionItem[] =
        result?.data != null ? field.select(result.data) : debounced ? [] : [...(field.initialItems ?? [])]
      // Pin the selected value into the items so the trigger always resolves its label.
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
    // Per-field `toQuery` patches are key-disjoint by convention, so the merge is exactly the query-input shape.
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

/** Content equality for the controlled resync guard — pill lists are small. */
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

/** Decode a pill value through its field's codec onto the query patch;
 *  undecodable values contribute nothing (a fresh empty pill is a no-op). */
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
