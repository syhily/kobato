import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useDragDropHandle } from '@/context/DragDropHandleContext'
import { createDragDropHandle } from '@/plugins/behaviour/dragDropHandle'

// Thin per-instance suite: the generic handle semantics (partial setState,
// change guard, subscribe/unsubscribe, fallback) live in
// composer-handle.test.ts. What remains here is the drag-drop channel's own
// state shape and its context wiring.

describe('createDragDropHandle', () => {
  it('starts with no container element, no handler, and not dragging', () => {
    const handle = createDragDropHandle()

    expect(handle.getState()).toEqual({ containerElement: null, handler: null, isDragging: false })
  })
})

describe('DragDropHandleContext', () => {
  it('falls back to a default handle outside any provider', () => {
    const { result } = renderHook(() => useDragDropHandle())

    expect(result.current.getState()).toEqual({ containerElement: null, handler: null, isDragging: false })
  })
})
