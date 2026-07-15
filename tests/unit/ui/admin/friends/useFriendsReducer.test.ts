import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useFriendsReducer } from '@/ui/admin/friends/useFriendsReducer'

describe('useFriendsReducer', () => {
  it('starts with empty query and hidden excluded', () => {
    const { state } = renderHook(() => useFriendsReducer())
    expect(state.q).toBe('')
    expect(state.includeHidden).toBe(false)
  })

  it('updates the search query', () => {
    const { state } = renderHook(() => useFriendsReducer(), {
      actions: [({ dispatch }) => dispatch({ type: 'setQ', value: 'alice' })],
    })
    expect(state.q).toBe('alice')
  })

  it('toggles inclusion of hidden friends', () => {
    const { state } = renderHook(() => useFriendsReducer(), {
      actions: [({ dispatch }) => dispatch({ type: 'setIncludeHidden', value: true })],
    })
    expect(state.includeHidden).toBe(true)
  })

  it('keeps the search query when toggling hidden inclusion', () => {
    const { state } = renderHook(() => useFriendsReducer(), {
      actions: [
        ({ dispatch }) => dispatch({ type: 'setQ', value: 'bob' }),
        ({ dispatch }) => dispatch({ type: 'setIncludeHidden', value: true }),
      ],
    })
    expect(state.q).toBe('bob')
    expect(state.includeHidden).toBe(true)
  })
})
