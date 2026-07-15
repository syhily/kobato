import { describe, expect, it } from 'vitest'

import type { AdminCategoryDto } from '@/shared/types/categories'

import { renderHook } from '#/_helpers/hook'
import { useCategoriesReducer } from '@/ui/admin/categories/useCategoriesReducer'

function makeAdminCategory(overrides: Partial<AdminCategoryDto> = {}): AdminCategoryDto {
  return {
    id: 'cat-1',
    name: '默认分类',
    slug: 'default',
    cover: '',
    og: null,
    description: '',
    sortOrder: 0,
    postCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('useCategoriesReducer', () => {
  it('starts with an empty list', () => {
    const { state } = renderHook(() => useCategoriesReducer())
    expect(state.rows).toEqual([])
    expect(state.total).toBe(0)
    expect(state.q).toBe('')
  })

  it('loads rows and total', () => {
    const category = makeAdminCategory({ id: 'cat-1', name: 'A' })
    const { state } = renderHook(() => useCategoriesReducer(), {
      actions: [({ dispatch }) => dispatch({ type: 'loaded', rows: [category], total: 1 })],
    })
    expect(state.rows).toEqual([category])
    expect(state.total).toBe(1)
  })

  it('patches an existing category', () => {
    const category = makeAdminCategory({ id: 'cat-1', name: 'A' })
    const { state } = renderHook(() => useCategoriesReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [category], total: 1 }),
        ({ dispatch }) => dispatch({ type: 'patchCategory', category: { ...category, name: 'A2' } }),
      ],
    })
    expect(state.rows[0]!.name).toBe('A2')
    expect(state.total).toBe(1)
  })

  it('prepends a new category', () => {
    const existing = makeAdminCategory({ id: 'cat-1', name: 'A' })
    const created = makeAdminCategory({ id: 'cat-2', name: 'B' })
    const { state } = renderHook(() => useCategoriesReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [existing], total: 1 }),
        ({ dispatch }) => dispatch({ type: 'prependCategory', category: created }),
      ],
    })
    expect(state.rows).toHaveLength(2)
    expect(state.rows[0]!.name).toBe('B')
    expect(state.total).toBe(2)
  })

  it('removes a category and decrements total', () => {
    const a = makeAdminCategory({ id: 'cat-1', name: 'A' })
    const b = makeAdminCategory({ id: 'cat-2', name: 'B' })
    const { state } = renderHook(() => useCategoriesReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [a, b], total: 2 }),
        ({ dispatch }) => dispatch({ type: 'removeCategory', id: a.id }),
      ],
    })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]!.id).toBe(b.id)
    expect(state.total).toBe(1)
  })

  it('reorders rows optimistically and rewrites sortOrder', () => {
    const a = makeAdminCategory({ id: 'cat-1', name: 'A', sortOrder: 0 })
    const b = makeAdminCategory({ id: 'cat-2', name: 'B', sortOrder: 1 })
    const c = makeAdminCategory({ id: 'cat-3', name: 'C', sortOrder: 2 })
    const { state } = renderHook(() => useCategoriesReducer(), {
      actions: [({ dispatch }) => dispatch({ type: 'loaded', rows: [a, b, c], total: 3 })],
    })
    const reordered = renderHook(() => useCategoriesReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [a, b, c], total: 3 }),
        ({ dispatch }) => dispatch({ type: 'reorderRows', orderedIds: [c.id, a.id, b.id] }),
      ],
    })
    expect(reordered.state.rows.map((row) => row.id)).toEqual([c.id, a.id, b.id])
    expect(reordered.state.rows.map((row) => row.sortOrder)).toEqual([0, 1, 2])
    expect(state.rows.map((row) => row.sortOrder)).toEqual([0, 1, 2])
  })

  it('replaces rows from the server', () => {
    const a = makeAdminCategory({ id: 'cat-1', name: 'A' })
    const b = makeAdminCategory({ id: 'cat-2', name: 'B' })
    const { state } = renderHook(() => useCategoriesReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [a], total: 1 }),
        ({ dispatch }) => dispatch({ type: 'replaceRows', rows: [b] }),
      ],
    })
    expect(state.rows).toEqual([b])
  })

  it('updates the search query', () => {
    const { state } = renderHook(() => useCategoriesReducer(), {
      actions: [({ dispatch }) => dispatch({ type: 'setQ', value: 'react' })],
    })
    expect(state.q).toBe('react')
  })
})
