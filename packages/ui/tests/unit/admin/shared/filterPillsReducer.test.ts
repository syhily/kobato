import { filterPillsReducer, type ActiveFilter } from '@kobato/ui/admin/shared/filterPillsReducer'
import { describe, expect, it } from 'vitest'

// Machine-level invariant matrix for the shared filter-pill machine. The
// three consumers (comments, audit log, images) parametrize it with their
// field-key union, so pill bookkeeping is pinned here once.

type Field = 'status' | 'page' | 'author'

function pill(field: Field, value: string = field, label: string = value): ActiveFilter<Field> {
  return { field, value, label }
}

describe('filterPillsReducer', () => {
  it('addFilter appends a pill for a new field', () => {
    const next = filterPillsReducer<Field>([], {
      type: 'addFilter',
      field: 'status',
      value: 'pending',
      label: '待审核',
    })
    expect(next).toEqual([{ field: 'status', value: 'pending', label: '待审核' }])
  })

  it('addFilter replaces the existing pill for the same field (single pill per field)', () => {
    const prev = [pill('status', 'pending', '待审核')]
    const next = filterPillsReducer<Field>(prev, {
      type: 'addFilter',
      field: 'status',
      value: 'approved',
      label: '已审核',
    })
    expect(next).toEqual([{ field: 'status', value: 'approved', label: '已审核' }])
  })

  it('addFilter keeps other fields and moves the replaced pill to the end', () => {
    const prev = [pill('status', 'pending', '待审核'), pill('page', 'pid-1')]
    const next = filterPillsReducer<Field>(prev, {
      type: 'addFilter',
      field: 'status',
      value: 'approved',
      label: '已审核',
    })
    expect(next).toEqual([pill('page', 'pid-1'), { field: 'status', value: 'approved', label: '已审核' }])
  })

  it('addFilter does not mutate the previous array', () => {
    const prev = [pill('status', 'pending', '待审核')]
    const next = filterPillsReducer<Field>(prev, { type: 'addFilter', field: 'page', value: 'pid-1', label: 'pid-1' })
    expect(next).not.toBe(prev)
    expect(prev).toHaveLength(1)
  })

  it('removeFilter drops the pill with the given field', () => {
    const prev = [pill('status', 'pending', '待审核'), pill('page', 'pid-1')]
    const next = filterPillsReducer<Field>(prev, { type: 'removeFilter', field: 'status' })
    expect(next).toEqual([pill('page', 'pid-1')])
  })

  it('removeFilter is a no-op for a missing field', () => {
    const prev = [pill('page', 'pid-1')]
    const next = filterPillsReducer<Field>(prev, { type: 'removeFilter', field: 'status' })
    expect(next).toHaveLength(1)
  })

  it('renameFilter updates the label in place, preserving position', () => {
    const prev = [pill('author', '42'), pill('page', 'pid-1')]
    const next = filterPillsReducer<Field>(prev, { type: 'renameFilter', field: 'author', label: 'Alice' })
    expect(next.map((f) => f.field)).toEqual(['author', 'page'])
    expect(next[0]).toEqual({ field: 'author', value: '42', label: 'Alice' })
    expect(next[1]).toEqual(pill('page', 'pid-1'))
  })

  it('renameFilter returns the same array when the field is missing', () => {
    const prev: ActiveFilter<Field>[] = []
    const next = filterPillsReducer<Field>(prev, { type: 'renameFilter', field: 'author', label: 'Alice' })
    expect(next).toBe(prev)
  })

  it('clearFilters empties the pill list', () => {
    const prev = [pill('status', 'pending', '待审核'), pill('page', 'pid-1'), pill('author', '42')]
    const next = filterPillsReducer<Field>(prev, { type: 'clearFilters' })
    expect(next).toEqual([])
  })
})
