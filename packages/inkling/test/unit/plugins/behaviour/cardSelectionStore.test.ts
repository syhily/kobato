import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createCardSelectionStoreWrapper } from '#/utils/card-selection-store'
import { useCardSelectionStore } from '@/context/CardSelectionStoreContext'
import { createCardSelectionStore } from '@/plugins/behaviour/cardSelectionStore'

// Thin per-instance suite: the generic handle semantics (partial setState,
// change guard, subscribe/unsubscribe, fallback) live in
// composer-handle.test.ts. What remains here is the card selection channel's
// own state shape and its per-composer provider behaviour.

describe('createCardSelectionStore', () => {
  it('starts with no selection and no editing card', () => {
    const store = createCardSelectionStore()

    expect(store.getState()).toEqual({ selectedCardKey: null, isEditingCard: false })
  })
})

describe('CardSelectionStoreContext', () => {
  it('provides a stable per-provider store instance', () => {
    const { wrapper } = createCardSelectionStoreWrapper()
    const { result, rerender } = renderHook(() => useCardSelectionStore(), { wrapper })
    const store = result.current

    rerender()

    expect(result.current).toBe(store)
    expect(store.getState()).toEqual({ selectedCardKey: null, isEditingCard: false })
  })

  it('creates a separate store per composer provider', () => {
    const first = renderHook(() => useCardSelectionStore(), { wrapper: createCardSelectionStoreWrapper().wrapper })
    const second = renderHook(() => useCardSelectionStore(), { wrapper: createCardSelectionStoreWrapper().wrapper })

    expect(first.result.current).not.toBe(second.result.current)

    act(() => first.result.current.setState({ selectedCardKey: 'card-1' }))
    expect(second.result.current.getState().selectedCardKey).toBeNull()
  })

  it('falls back to a default store outside any provider', () => {
    const { result } = renderHook(() => useCardSelectionStore())

    expect(result.current.getState()).toEqual({
      selectedCardKey: null,
      isEditingCard: false,
    })
  })
})
