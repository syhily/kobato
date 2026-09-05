import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useKeyboardListSelection } from '@/hooks/useKeyboardListSelection'

function pressArrowDown() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
  })
}

describe('useKeyboardListSelection', () => {
  it('clamps ArrowDown on an empty list to 0 instead of -1', () => {
    const onSelect = vi.fn()
    const { result } = renderHook(() => useKeyboardListSelection({ items: [], onSelect }))

    pressArrowDown()

    expect(result.current.selectedIndex).not.toBe(-1)
    expect(result.current.selectedIndex).toBe(0)
  })

  it('keeps the first item selected when the list goes from empty to non-empty', () => {
    const onSelect = vi.fn()
    const { result, rerender } = renderHook(({ items }) => useKeyboardListSelection({ items, onSelect }), {
      initialProps: { items: [] as string[] },
    })

    pressArrowDown()
    rerender({ items: ['a', 'b', 'c'] })

    // the highlight must land on the first item without another ArrowDown
    expect(result.current.selectedIndex).toBe(0)
    expect(result.current.selectedIndex).toBeLessThan(3)
  })
})
