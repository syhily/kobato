import { describe, expect, it } from 'vitest'

import { rowsReducer, type RowsState } from '@/ui/admin/shared/rowsReducer'

// Machine-level invariant matrix for the shared admin rows machine. The five
// entity hooks (tags/categories/users/pages/posts) compose this reducer, so
// rows/total bookkeeping is pinned here once instead of per entity.

interface Row {
  id: string
  name: string
}

function makeRow(id: string, name = `Row ${id}`): Row {
  return { id, name }
}

function makeState(rows: Row[], total: number): RowsState<Row> {
  return { rows, total }
}

describe('rowsReducer', () => {
  it('loaded replaces rows and total', () => {
    const state = makeState([makeRow('stale')], 9)
    const rows = [makeRow('1'), makeRow('2')]
    const next = rowsReducer(state, { type: 'loaded', rows, total: 5 })
    expect(next.rows).toEqual(rows)
    expect(next.total).toBe(5)
  })

  it('appended concatenates rows and adopts the new total', () => {
    const state = makeState([makeRow('1')], 3)
    const next = rowsReducer(state, { type: 'appended', rows: [makeRow('2'), makeRow('3')], total: 3 })
    expect(next.rows.map((row) => row.id)).toEqual(['1', '2', '3'])
    expect(next.total).toBe(3)
  })

  it('patch merges the matching row in place, preserving order and total', () => {
    const state = makeState([makeRow('1', 'A'), makeRow('2', 'B')], 2)
    const next = rowsReducer(state, { type: 'patch', row: makeRow('2', 'B2') })
    expect(next.rows.map((row) => row.name)).toEqual(['A', 'B2'])
    expect(next.total).toBe(2)
  })

  it('patch ignores an unknown id', () => {
    const state = makeState([makeRow('1', 'A')], 1)
    const next = rowsReducer(state, { type: 'patch', row: makeRow('nope', 'X') })
    expect(next.rows).toEqual(state.rows)
    expect(next.total).toBe(1)
  })

  // Regression pin: `useUsersReducer.removeUser` drifted from the other four
  // copies and left `total` untouched. The unified machine always decrements,
  // so every surface's header count updates immediately on remove.
  it('remove drops the row and decrements total', () => {
    const state = makeState([makeRow('1'), makeRow('2')], 2)
    const next = rowsReducer(state, { type: 'remove', id: '1' })
    expect(next.rows).toEqual([makeRow('2')])
    expect(next.total).toBe(1)
  })

  it('remove never decrements total below zero', () => {
    const state = makeState([makeRow('1')], 1)
    const once = rowsReducer(state, { type: 'remove', id: '1' })
    const twice = rowsReducer(once, { type: 'remove', id: '1' })
    expect(twice.rows).toEqual([])
    expect(twice.total).toBe(0)
  })

  it('prepend inserts at the front and increments total', () => {
    const state = makeState([makeRow('1')], 1)
    const next = rowsReducer(state, { type: 'prepend', row: makeRow('2') })
    expect(next.rows.map((row) => row.id)).toEqual(['2', '1'])
    expect(next.total).toBe(2)
  })

  it('does not mutate the previous state', () => {
    const state = makeState([makeRow('1')], 1)
    const next = rowsReducer(state, { type: 'remove', id: '1' })
    expect(next).not.toBe(state)
    expect(state.rows).toHaveLength(1)
    expect(state.total).toBe(1)
  })
})
