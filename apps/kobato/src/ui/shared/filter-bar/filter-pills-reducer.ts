export interface ActiveFilter<TField extends string = string> {
  field: TField
  value: string
  label: string
}

export type FilterPillsAction<TField extends string = string> =
  | { type: 'addFilter'; field: TField; value: string; label: string }
  | { type: 'removeFilter'; field: TField }
  | { type: 'renameFilter'; field: TField; label: string }
  | { type: 'clearFilters' }

export function filterPillsReducer<TField extends string>(
  filters: ActiveFilter<TField>[],
  action: FilterPillsAction<TField>,
): ActiveFilter<TField>[] {
  switch (action.type) {
    case 'addFilter': {
      const idx = filters.findIndex((f) => f.field === action.field)
      if (idx === -1) {
        return [...filters, { field: action.field, value: action.value, label: action.label }]
      }
      const next = [...filters]
      next[idx] = { field: action.field, value: action.value, label: action.label }
      return next
    }
    case 'removeFilter':
      return filters.filter((f) => f.field !== action.field)
    case 'renameFilter': {
      const idx = filters.findIndex((f) => f.field === action.field)
      if (idx === -1) {
        return filters
      }
      const next = [...filters]
      next[idx] = { ...next[idx]!, label: action.label }
      return next
    }
    case 'clearFilters':
      return []
  }
}
