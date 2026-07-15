import { describe, expect, it } from 'vitest'

import type { AdminTagDto } from '@/shared/types/tags'

import { renderHook } from '#/_helpers/hook'
import { useTagsReducer } from '@/ui/admin/tags/useTagsReducer'

function makeAdminTag(overrides: Partial<AdminTagDto> = {}): AdminTagDto {
  return {
    id: 'tag-1',
    name: '默认标签',
    slug: 'default',
    ogImage: '',
    postCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('useTagsReducer', () => {
  it('starts with an empty list', () => {
    const { state } = renderHook(() => useTagsReducer())
    expect(state.rows).toEqual([])
    expect(state.total).toBe(0)
    expect(state.hasMore).toBe(false)
    expect(state.q).toBe('')
  })

  it('loads rows, total and hasMore flag', () => {
    const tag = makeAdminTag({ id: 'tag-1', name: 'A' })
    const { state } = renderHook(() => useTagsReducer(), {
      actions: [({ dispatch }) => dispatch({ type: 'loaded', rows: [tag], total: 1, hasMore: true })],
    })
    expect(state.rows).toEqual([tag])
    expect(state.total).toBe(1)
    expect(state.hasMore).toBe(true)
  })

  it('appends rows and updates pagination flags', () => {
    const a = makeAdminTag({ id: 'tag-1', name: 'A' })
    const b = makeAdminTag({ id: 'tag-2', name: 'B' })
    const { state } = renderHook(() => useTagsReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [a], total: 2, hasMore: true }),
        ({ dispatch }) => dispatch({ type: 'appended', rows: [b], total: 2, hasMore: false }),
      ],
    })
    expect(state.rows).toEqual([a, b])
    expect(state.total).toBe(2)
    expect(state.hasMore).toBe(false)
  })

  it('patches an existing tag', () => {
    const tag = makeAdminTag({ id: 'tag-1', name: 'A' })
    const { state } = renderHook(() => useTagsReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [tag], total: 1, hasMore: false }),
        ({ dispatch }) => dispatch({ type: 'patchTag', tag: { ...tag, name: 'A2' } }),
      ],
    })
    expect(state.rows[0]!.name).toBe('A2')
  })

  it('prepends a new tag', () => {
    const existing = makeAdminTag({ id: 'tag-1', name: 'A' })
    const created = makeAdminTag({ id: 'tag-2', name: 'B' })
    const { state } = renderHook(() => useTagsReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [existing], total: 1, hasMore: false }),
        ({ dispatch }) => dispatch({ type: 'prependTag', tag: created }),
      ],
    })
    expect(state.rows[0]!.name).toBe('B')
    expect(state.total).toBe(2)
  })

  it('removes a tag and decrements total', () => {
    const a = makeAdminTag({ id: 'tag-1', name: 'A' })
    const b = makeAdminTag({ id: 'tag-2', name: 'View' })
    const { state } = renderHook(() => useTagsReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'loaded', rows: [a, b], total: 2, hasMore: false }),
        ({ dispatch }) => dispatch({ type: 'removeTag', id: a.id }),
      ],
    })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]!.id).toBe(b.id)
    expect(state.total).toBe(1)
  })

  it('updates the search query', () => {
    const { state } = renderHook(() => useTagsReducer(), {
      actions: [({ dispatch }) => dispatch({ type: 'setQ', value: 'react' })],
    })
    expect(state.q).toBe('react')
  })
})
