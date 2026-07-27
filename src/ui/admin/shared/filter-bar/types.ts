import type { UseQueryOptions } from '@tanstack/react-query'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import type { DateFilterValue, SingleDateFilterValue } from '@/ui/admin/shared/date-filter'
import type { TextFilterOperatorOption, TextFilterValue } from '@/ui/admin/shared/filter-bar/text-filter'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

// Shared filter-pill contracts for the admin list surfaces (comments,
// my-comments, audit log). A view declares its fields as a `FilterFieldSpec`
// array — the closed `kind` union picks the editor chrome — and the hook +
// bar own everything else. Pill values stay opaque strings at the interface;
// each `toQuery` maps a DECODED value onto the domain's list-query patch.

export type FilterFieldIcon = ComponentType<SVGProps<SVGSVGElement>>

export interface FilterOptionItem {
  value: string
  label: string
}

/** Custom row renderer for option dropdowns — exists so the audit actor
 *  picker keeps its icon + truncated-label rows. */
export type FilterOptionRenderer = (option: FilterOptionItem, selected: boolean) => ReactNode

/** Partial list-query patch contributed by one active filter. `undefined`
 *  entries are dropped by the merge; `{}` contributes nothing. */
export type FilterQueryPatch = Record<string, string | undefined>

interface FilterFieldBase<K extends string> {
  key: K
  label: string
  icon: FilterFieldIcon
}

/** Static option list (comments status, audit action / resourceType / actor). */
export interface OptionsFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'options'
  options: readonly FilterOptionItem[]
  searchable?: boolean
  searchPlaceholder?: string
  searchEmptyMessage?: string
  renderOption?: FilterOptionRenderer
  toQuery: (value: string) => FilterQueryPatch
}

/** Async combobox backed by a debounced server search (comments page /
 *  author, my-comments entity). `select` maps the procedure's data onto
 *  items; `resolveOptions` rehydrates a URL-restored pill's human label. */
export interface SearchFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'search'
  // The `any`s keep the spec closed over heterogeneous procedure data while
  // letting each call site annotate its concrete `select` parameter.
  queryOptions: (query: string) => UseQueryOptions<any, Error, any, any>
  select: (data: any) => FilterOptionItem[]
  /** Fallback items while no search query is active (loader-provided lists). */
  initialItems?: readonly FilterOptionItem[]
  resolveOptions?: (value: string) => UseQueryOptions<any, Error, any, any>
  renderOption?: FilterOptionRenderer
  placeholder: string
  inputPlaceholder: string
  emptyMessage?: string
  toQuery: (value: string) => FilterQueryPatch
}

/** Operator dropdown + free text, committed on blur / Enter (内容). */
export interface TextFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'text'
  operators: readonly TextFilterOperatorOption[]
  toQuery: (value: TextFilterValue) => FilterQueryPatch
}

/** Bare blur-commit input (audit IP). */
export interface FreetextFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'freetext'
  placeholder: string
  toQuery: (value: string) => FilterQueryPatch
}

/** Single date + operator (comments 时间). */
export interface DateSingleFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'date-single'
  toQuery: (value: SingleDateFilterValue) => FilterQueryPatch
}

/** From/to range picker (audit 时间). */
export interface DateRangeFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'date-range'
  toQuery: (value: DateFilterValue) => FilterQueryPatch
}

export type FilterFieldSpec<K extends string> =
  | OptionsFilterField<K>
  | SearchFilterField<K>
  | TextFilterField<K>
  | FreetextFilterField<K>
  | DateSingleFilterField<K>
  | DateRangeFilterField<K>

/** Per-search-field live state handed to the bar: the resolved item list
 *  (with the selected value pinned in), the pending flag that swaps the
 *  empty message to 加载中…, and the immediate (pre-debounce) search setter. */
export interface SearchFieldState {
  items: FilterOptionItem[]
  isPending: boolean
  setQuery: (query: string) => void
}

/** Everything `<FilterPillBar>` needs — assembled by `useFilterPills` and
 *  spread straight onto the component. */
export interface FilterPillBarProps<K extends string> {
  fields: readonly FilterFieldSpec<K>[]
  filters: ActiveFilter<K>[]
  search: Partial<Record<K, SearchFieldState>>
  onAddFilter: (field: K, value: string, label: string) => void
  onRemoveFilter: (field: K) => void
  onClearFilters: () => void
}
