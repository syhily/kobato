import { useDragDropHandle } from '@kobato/inkling-internal/context/DragDropHandleContext'
import { createDragDropHandle } from '@kobato/inkling-internal/plugins/behaviour/drag-drop-handle'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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
