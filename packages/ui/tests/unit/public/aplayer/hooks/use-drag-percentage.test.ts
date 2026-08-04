import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'

import { renderHook } from '#/_helpers/hook'

import { useDragPercentage } from '@kobato/ui/public/aplayer/hooks/use-drag-percentage'
import { computePercentage } from '@kobato/ui/public/aplayer/utils/compute-percentage'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The renderHook harness renders a single synchronous SSR pass, so the
// mousedown handler (and the document-level listeners it arms) must be
// driven through the `actions` queue inside that pass. `document` is
// stubbed to capture the listeners and their AbortSignals; geometry comes
// from a fake track element (clientWidth 100 at left 0, so clientX maps
// 1:1 onto the clamped percentage).

type DragHandler = (event: MouseEvent) => void

function fakeBarRef(): RefObject<HTMLDivElement | null> {
  return {
    current: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      clientWidth: 100,
      clientHeight: 50,
    } as HTMLDivElement,
  }
}

function stubDocument() {
  const listeners = new Map<string, DragHandler>()
  const signals: AbortSignal[] = []
  vi.stubGlobal('document', {
    addEventListener: vi.fn((type: string, handler: DragHandler, options?: { signal?: AbortSignal }) => {
      listeners.set(type, handler)
      if (options?.signal) {
        signals.push(options.signal)
      }
    }),
  })
  return { listeners, signals }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ui/public/aplayer/hooks/useDragPercentage — initial state', () => {
  it('starts idle and exposes the mousedown handler', () => {
    const api = renderHook(() => useDragPercentage(fakeBarRef(), { compute: computePercentage, onChange: vi.fn() }))
    expect(api.isDragging).toBe(false)
    expect(api.isDraggingRef.current).toBe(false)
    expect(api.handleMouseDown).toBeInstanceOf(Function)
  })
})

describe('ui/public/aplayer/hooks/useDragPercentage — drag lifecycle', () => {
  it('fires onChange on down/move/up and onCommit once with the final percentage', () => {
    const { listeners, signals } = stubDocument()
    const onChange = vi.fn()
    const onCommit = vi.fn()

    const api = renderHook(() => useDragPercentage(fakeBarRef(), { compute: computePercentage, onChange, onCommit }), {
      actions: [
        (result) => result.handleMouseDown({ clientX: 25 } as ReactMouseEvent),
        () => listeners.get('mousemove')?.({ clientX: 50 } as MouseEvent),
        () => listeners.get('mouseup')?.({ clientX: 75 } as MouseEvent),
      ],
    })

    expect(onChange.mock.calls).toEqual([[0.25], [0.5], [0.75]])
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(0.75)
    // The drag settled: both document listeners were armed with the same
    // controller signal and aborted on mouseup.
    expect(listeners.has('mousemove')).toBe(true)
    expect(listeners.has('mouseup')).toBe(true)
    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(api.isDragging).toBe(false)
    expect(api.isDraggingRef.current).toBe(false)
  })

  it('works without onCommit (volume semantics)', () => {
    const { listeners } = stubDocument()
    const onChange = vi.fn()

    renderHook(() => useDragPercentage(fakeBarRef(), { compute: computePercentage, onChange }), {
      actions: [
        (result) => result.handleMouseDown({ clientX: 10 } as ReactMouseEvent),
        () => listeners.get('mouseup')?.({ clientX: 20 } as MouseEvent),
      ],
    })

    expect(onChange.mock.calls).toEqual([[0.1], [0.2]])
  })

  it('re-arms a fresh AbortController per drag instead of reusing a settled one', () => {
    const { listeners, signals } = stubDocument()
    const onChange = vi.fn()

    renderHook(() => useDragPercentage(fakeBarRef(), { compute: computePercentage, onChange }), {
      actions: [
        (result) => result.handleMouseDown({ clientX: 0 } as ReactMouseEvent),
        () => listeners.get('mouseup')?.({ clientX: 0 } as MouseEvent),
        (result) => result.handleMouseDown({ clientX: 0 } as ReactMouseEvent),
      ],
    })

    // First drag's pair aborted; the second drag registered a new,
    // still-live pair of listeners.
    expect(signals).toHaveLength(4)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(true)
    expect(signals[2]?.aborted).toBe(false)
    expect(signals[3]?.aborted).toBe(false)
  })
})
