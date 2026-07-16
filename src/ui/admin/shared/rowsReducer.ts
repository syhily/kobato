// Shared rows state machine for admin list surfaces. Owns the rows/total
// bookkeeping in exactly one place; entity hooks (tags, categories, users,
// pages, posts) compose it and keep their entity-specific bits (filter
// fields, `hasMore`, derived status, reorder) local.
//
// `hasMore` is deliberately NOT part of this machine: only tags/users have
// it, and it always rides their `loaded`/`appended` actions, so those two
// hooks set it from the action next to the machine call instead of forcing
// a vestigial field onto the three surfaces that never read it.

export interface RowsState<T> {
  rows: T[]
  total: number
}

export type RowsAction<T extends { id: string }> =
  | { type: 'loaded'; rows: T[]; total: number }
  | { type: 'appended'; rows: T[]; total: number }
  | { type: 'patch'; row: T }
  | { type: 'remove'; id: string }
  | { type: 'prepend'; row: T }

export function rowsReducer<T extends { id: string }>(state: RowsState<T>, action: RowsAction<T>): RowsState<T> {
  switch (action.type) {
    case 'loaded':
      return { rows: action.rows, total: action.total }
    case 'appended':
      return { rows: [...state.rows, ...action.rows], total: action.total }
    case 'patch':
      return {
        ...state,
        rows: state.rows.map((row) => (row.id === action.row.id ? { ...row, ...action.row } : row)),
      }
    case 'remove':
      // Optimistic removal: drop the row from the visible list and
      // decrement `total` (never below zero). The next scroll/load
      // re-syncs if needed.
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
        total: Math.max(0, state.total - 1),
      }
    case 'prepend':
      return { ...state, rows: [action.row, ...state.rows], total: state.total + 1 }
  }
}
