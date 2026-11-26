import type { UseQueryOptions } from '@tanstack/react-query'
import type { ComponentType, ReactNode, SVGProps } from 'react'

import type { DateFilterValue, SingleDateFilterValue } from '@/ui/shared/filter-bar/date-filter'
import type { ActiveFilter } from '@/ui/shared/filter-bar/filter-pills-reducer'
import type { TextFilterOperatorOption, TextFilterValue } from '@/ui/shared/filter-bar/text-filter'

export type FilterFieldIcon = ComponentType<SVGProps<SVGSVGElement>>

export interface FilterOptionItem {
  value: string
  label: string
}

export type FilterOptionRenderer = (option: FilterOptionItem, selected: boolean) => ReactNode

export type FilterQueryPatch = Record<string, string | undefined>

interface FilterFieldBase<K extends string> {
  key: K
  label: string
  icon: FilterFieldIcon
}

export interface OptionsFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'options'
  options: readonly FilterOptionItem[]
  searchable?: boolean
  searchPlaceholder?: string
  searchEmptyMessage?: string
  renderOption?: FilterOptionRenderer
  toQuery: (value: string) => FilterQueryPatch
}

export interface SearchFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'search'
  queryOptions: (query: string) => UseQueryOptions<any, Error, any, any>
  select: (data: any) => FilterOptionItem[]
  initialItems?: readonly FilterOptionItem[]
  resolveOptions?: (value: string) => UseQueryOptions<any, Error, any, any>
  renderOption?: FilterOptionRenderer
  placeholder: string
  inputPlaceholder: string
  emptyMessage?: string
  toQuery: (value: string) => FilterQueryPatch
}

export interface TextFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'text'
  operators: readonly TextFilterOperatorOption[]
  inputAria?: string
  inputPlaceholder?: string
  toQuery: (value: TextFilterValue) => FilterQueryPatch
}

export interface FreetextFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'freetext'
  placeholder: string
  toQuery: (value: string) => FilterQueryPatch
}

export interface DateSingleFilterField<K extends string> extends FilterFieldBase<K> {
  kind: 'date-single'
  toQuery: (value: SingleDateFilterValue) => FilterQueryPatch
}

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

export interface SearchFieldState {
  items: FilterOptionItem[]
  isPending: boolean
  setQuery: (query: string) => void
}

export interface FilterPillBarProps<K extends string> {
  fields: readonly FilterFieldSpec<K>[]
  filters: ActiveFilter<K>[]
  search: Partial<Record<K, SearchFieldState>>
  onAddFilter: (field: K, value: string, label: string) => void
  onRemoveFilter: (field: K) => void
  onClearFilters: () => void
}
