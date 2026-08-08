import type { UseQueryOptions } from '@tanstack/react-query'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import type { DateFilterValue, SingleDateFilterValue } from '@/ui/admin/shared/date-filter'
import type { TextFilterOperatorOption, TextFilterValue } from '@/ui/admin/shared/filter-bar/text-filter'
import type { ActiveFilter } from '@/ui/admin/shared/filterPillsReducer'

// Shared filter-pill contracts: views declare fields as a `FilterFieldSpec` array; pill values stay opaque strings.

export type FilterFieldIcon = ComponentType<SVGProps<SVGSVGElement>>

export interface FilterOptionItem {
  value: string
  label: string
}

/** Custom row renderer for option dropdowns (audit actor keeps icon + truncated labels). */
export type FilterOptionRenderer = (option: FilterOptionItem, selected: boolean) => ReactNode

/** Partial list-query patch from one filter: `undefined` entries are dropped by the merge. */
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

/** Async combobox backed by a debounced server search; `resolveOptions` rehydrates a URL-restored pill's label. */
export interface SearchFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'search'
  // `any`s keep the spec closed over heterogeneous procedure data.
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

/** Per-search-field live state for the bar: resolved items, pending flag, pre-debounce setter. */
export interface SearchFieldState {
  items: FilterOptionItem[]
  isPending: boolean
  setQuery: (query: string) => void
}

/** Everything `<FilterPillBar>` needs — assembled by `useFilterPills`. */
export interface FilterPillBarProps<K extends string> {
  fields: readonly FilterFieldSpec<K>[]
  filters: ActiveFilter<K>[]
  search: Partial<Record<K, SearchFieldState>>
  onAddFilter: (field: K, value: string, label: string) => void
  onRemoveFilter: (field: K) => void
  onClearFilters: () => void
}
