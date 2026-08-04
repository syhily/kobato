import { renderHook } from '#/_helpers/hook'

import { useImagesReducer } from '@kobato/ui/admin/images/useImagesReducer'
import { describe, expect, it } from 'vitest'

describe('ui/admin/images/useImagesReducer', () => {
  it('starts empty', () => {
    const { state, q, kind, activeFilters, pageSize } = renderHook(useImagesReducer)
    expect(state.filters).toHaveLength(0)
    expect(q).toBe('')
    expect(kind).toBe('all')
    expect(activeFilters).toHaveLength(0)
    expect(pageSize).toBe(60)
  })

  it('adds kind and q filters', () => {
    const { kind, activeFilters } = renderHook(useImagesReducer, {
      actions: [
        (r) => r.dispatch({ type: 'addFilter', field: 'kind', value: 'category', label: '分类' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'q', value: 'cat', label: 'cat' }),
      ],
    })
    expect(kind).toBe('category')
    expect(activeFilters).toHaveLength(2)
    expect(activeFilters[1]!).toEqual({ field: 'q', value: 'cat', label: 'cat' })
  })

  it('ignores unknown kind values', () => {
    const { kind } = renderHook(useImagesReducer, {
      actions: [(r) => r.dispatch({ type: 'addFilter', field: 'kind', value: 'unknown', label: '未知' })],
    })
    expect(kind).toBe('all')
  })

  it('updates q via setQ', () => {
    const { q } = renderHook(useImagesReducer, {
      actions: [(r) => r.dispatch({ type: 'setQ', value: 'puppy' })],
    })
    expect(q).toBe('puppy')
  })

  it('removes a filter and resets q when no q filter remains', () => {
    const { q, kind, activeFilters } = renderHook(useImagesReducer, {
      actions: [
        (r) => r.dispatch({ type: 'addFilter', field: 'kind', value: 'category', label: '分类' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'q', value: 'foo', label: 'foo' }),
        (r) => r.dispatch({ type: 'removeFilter', field: 'q' }),
      ],
    })
    expect(activeFilters).toHaveLength(1)
    expect(kind).toBe('category')
    expect(q).toBe('')
  })

  it('keeps q state when a q filter remains', () => {
    const { q, activeFilters } = renderHook(useImagesReducer, {
      actions: [
        (r) => r.dispatch({ type: 'setQ', value: 'foo' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'q', value: 'foo', label: 'foo' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'kind', value: 'category', label: '分类' }),
        (r) => r.dispatch({ type: 'removeFilter', field: 'kind' }),
      ],
    })
    expect(activeFilters).toHaveLength(1)
    expect(q).toBe('foo')
  })

  it('clears all filters and q', () => {
    const { q, kind, activeFilters } = renderHook(useImagesReducer, {
      actions: [
        (r) => r.dispatch({ type: 'addFilter', field: 'kind', value: 'category', label: '分类' }),
        (r) => r.dispatch({ type: 'addFilter', field: 'q', value: 'foo', label: 'foo' }),
        (r) => r.dispatch({ type: 'clearFilters' }),
      ],
    })
    expect(activeFilters).toHaveLength(0)
    expect(q).toBe('')
    expect(kind).toBe('all')
  })
})
