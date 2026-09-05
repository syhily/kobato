import { describe, expect, it, vi } from 'vitest'

import {
  createDragStartSession,
  DRAG_START_THRESHOLD,
  type DragSessionPoint,
  type DragStartSessionListeners,
} from '@/utils/draggable/drag-session'

// the threshold policy is exercised synchronously through the ports: the
// listen port captures the session's listeners (standing in for the document
// event listeners DragDropHandler attaches) and the start/cancel ports record
// the resolution
function setup(grab: DragSessionPoint = { x: 10, y: 10 }) {
  const onStart = vi.fn()
  const onCancel = vi.fn()
  const detach = vi.fn()
  const attached: { listeners: DragStartSessionListeners | null } = { listeners: null }
  const session = createDragStartSession(grab, {
    listen: (listeners) => {
      attached.listeners = listeners
      return detach
    },
    onStart,
    onCancel,
  })
  const listeners = () => {
    if (!attached.listeners) {
      throw new Error('expected the listen port to have been called')
    }
    return attached.listeners
  }
  return { session, onStart, onCancel, detach, listeners }
}

describe('createDragStartSession', () => {
  it('ignores pointer travel within the start threshold', () => {
    const { session, onStart, listeners } = setup()

    // exactly at the threshold is not a crossing, through the session port…
    session.move({ x: 10 + DRAG_START_THRESHOLD, y: 10 })
    expect(onStart).not.toHaveBeenCalled()
    expect(session.isPending()).toBe(true)

    // …or through the listener port, on either axis
    listeners().move({ x: 10, y: 10 + DRAG_START_THRESHOLD })
    expect(onStart).not.toHaveBeenCalled()
    expect(session.isPending()).toBe(true)
  })

  it('starts the drag once pointer travel crosses the threshold', () => {
    const { session, onStart, onCancel, detach } = setup()

    session.move({ x: 10 + DRAG_START_THRESHOLD + 1, y: 10 })

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(detach).toHaveBeenCalledTimes(1)
    expect(session.isPending()).toBe(false)
  })

  it('crosses the threshold on either axis', () => {
    const { session, onStart } = setup()

    session.move({ x: 10, y: 10 - DRAG_START_THRESHOLD - 1 })

    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('measures travel from the grab point, not the previous move', () => {
    const { session, onStart } = setup()

    session.move({ x: 10, y: 10 })
    expect(onStart).not.toHaveBeenCalled()

    session.move({ x: 10 + DRAG_START_THRESHOLD + 1, y: 10 })
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('resolves exactly once — moves after the start are inert', () => {
    const { session, onStart, onCancel, detach } = setup()

    session.move({ x: 20, y: 20 })
    session.move({ x: 30, y: 30 })
    session.cancel()

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(detach).toHaveBeenCalledTimes(1)
  })

  it('cancels when the pointer is released before the threshold', () => {
    const { session, onStart, onCancel, detach, listeners } = setup()

    listeners().release()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
    expect(detach).toHaveBeenCalledTimes(1)
    expect(session.isPending()).toBe(false)

    // the session is finished — a later move is inert
    session.move({ x: 100, y: 100 })
    expect(onStart).not.toHaveBeenCalled()
  })

  it('cancels when a native drag begins before the threshold', () => {
    const { onStart, onCancel, listeners } = setup()

    listeners().nativeDrag()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('cancel is idempotent', () => {
    const { session, onCancel, detach } = setup()

    session.cancel()
    session.cancel()

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(detach).toHaveBeenCalledTimes(1)
  })

  it('works without an onCancel port', () => {
    const detach = vi.fn()
    const onStart = vi.fn()
    const session = createDragStartSession({ x: 0, y: 0 }, { listen: () => detach, onStart })

    expect(() => session.cancel()).not.toThrow()
    expect(detach).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })
})
