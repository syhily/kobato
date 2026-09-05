import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTKHandleWrapper } from '#/utils/tk-handle'
import { useTKHandle } from '@/context/TKHandleContext'
import { createTKHandle } from '@/plugins/behaviour/tkHandle'

// Thin per-instance suite: the generic handle semantics (partial setState,
// change guard, subscribe/unsubscribe, fallback) live in
// composer-handle.test.ts. What remains here is the tk channel's own state
// shape, its throttled derivation of the top-level node map, and its
// per-composer provider behaviour.

describe('createTKHandle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with an empty node map and zero count', () => {
    const handle = createTKHandle()

    expect(handle.getState()).toEqual({ tkNodeMap: {}, tkCount: 0 })
  })

  it('derives the top-level node map and count synchronously on the leading edge', () => {
    const handle = createTKHandle()

    handle.addEditorTkNode('editor-1', 'top-1', 'tk-1')

    expect(handle.getState()).toEqual({ tkNodeMap: { 'top-1': ['tk-1'] }, tkCount: 1 })
  })

  it('coalesces rapid mutations into one trailing derivation', () => {
    const handle = createTKHandle()
    handle.addEditorTkNode('editor-1', 'top-1', 'tk-1')

    const listener = vi.fn()
    handle.subscribe(listener)

    handle.addEditorTkNode('editor-1', 'top-1', 'tk-2')
    handle.addEditorTkNode('editor-2', 'top-2', 'tk-3')
    handle.addEditorTkNode('editor-2', 'top-2', 'tk-4')

    // still inside the throttle window: no intermediate derivation
    expect(listener).not.toHaveBeenCalled()
    expect(handle.getState().tkCount).toBe(1)

    vi.advanceTimersByTime(5)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(handle.getState()).toEqual({
      tkNodeMap: { 'top-1': ['tk-1', 'tk-2'], 'top-2': ['tk-3', 'tk-4'] },
      tkCount: 4,
    })
  })

  it('groups tk nodes from every editor under their top-level node', () => {
    const handle = createTKHandle()

    handle.addEditorTkNode('editor-1', 'top-1', 'tk-1')
    vi.advanceTimersByTime(5)
    handle.addEditorTkNode('editor-2', 'top-1', 'tk-2')
    vi.advanceTimersByTime(5)

    expect(handle.getState()).toEqual({ tkNodeMap: { 'top-1': ['tk-1', 'tk-2'] }, tkCount: 2 })
  })

  it('removes tk nodes and drops the editor entry when it empties', () => {
    const handle = createTKHandle()

    handle.addEditorTkNode('editor-1', 'top-1', 'tk-1')
    handle.addEditorTkNode('editor-1', 'top-1', 'tk-2')
    vi.advanceTimersByTime(5)

    handle.removeEditorTkNode('editor-1', 'tk-1')
    vi.advanceTimersByTime(5)

    expect(handle.getState()).toEqual({ tkNodeMap: { 'top-1': ['tk-2'] }, tkCount: 1 })

    handle.removeEditorTkNode('editor-1', 'tk-2')
    vi.advanceTimersByTime(5)

    expect(handle.getState()).toEqual({ tkNodeMap: {}, tkCount: 0 })
  })

  it('clears an editor and its nodes on removeEditor', () => {
    const handle = createTKHandle()

    handle.addEditorTkNode('editor-1', 'top-1', 'tk-1')
    handle.addEditorTkNode('editor-2', 'top-2', 'tk-2')
    vi.advanceTimersByTime(5)

    handle.removeEditor('editor-1')
    vi.advanceTimersByTime(5)

    expect(handle.getState()).toEqual({ tkNodeMap: { 'top-2': ['tk-2'] }, tkCount: 1 })
  })
})

describe('TKHandleContext', () => {
  it('provides a stable per-provider handle instance', () => {
    const { wrapper } = createTKHandleWrapper()
    const { result, rerender } = renderHook(() => useTKHandle(), { wrapper })
    const handle = result.current

    rerender()

    expect(result.current).toBe(handle)
    expect(handle.getState()).toEqual({ tkNodeMap: {}, tkCount: 0 })
  })

  it('creates a separate handle per composer provider', () => {
    const first = renderHook(() => useTKHandle(), { wrapper: createTKHandleWrapper().wrapper })
    const second = renderHook(() => useTKHandle(), { wrapper: createTKHandleWrapper().wrapper })

    expect(first.result.current).not.toBe(second.result.current)

    act(() => first.result.current.addEditorTkNode('editor-1', 'top-1', 'tk-1'))
    expect(second.result.current.getState().tkCount).toBe(0)
  })

  it('falls back to a default handle outside any provider', () => {
    const { result } = renderHook(() => useTKHandle())

    expect(result.current.getState()).toEqual({ tkNodeMap: {}, tkCount: 0 })
  })
})
