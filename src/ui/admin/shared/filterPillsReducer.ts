// Shared filter-pill state machine for admin list surfaces. Owns the
// add/remove/rename/clear pill bookkeeping in exactly one place; consumers
// (comments, audit log, images) parametrize it with their field-key union
// and keep their value codecs and side effects (images' q mirror) local.

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
      // One pill per field: a re-add replaces the existing pill and moves
      // it to the end.
      const next = filters.filter((f) => f.field !== action.field)
      return [...next, { field: action.field, value: action.value, label: action.label }]
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
