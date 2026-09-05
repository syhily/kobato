import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  createComposerHandle,
  createComposerHandleBinding,
  type ComposerHandle,
  type ComposerHandleBinding,
} from '@/plugins/behaviour/composer-handle'

interface TestState {
  count: number
  label: string | null
}

function createHandle(): ComposerHandle<TestState> {
  return createComposerHandle<TestState>({ count: 0, label: null })
}

function createBinding(): ComposerHandleBinding<TestState> {
  return createComposerHandleBinding<TestState>(createHandle)
}

function handleWrapper(binding: ComposerHandleBinding<TestState>, handle: ComposerHandle<TestState>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(binding.Context.Provider, { value: handle }, children)
  }
}

describe('createComposerHandle', () => {
  it('starts with the initial state', () => {
    const handle = createHandle()

    expect(handle.getState()).toEqual({ count: 0, label: null })
  })

  it('merges partial updates into the state', () => {
    const handle = createHandle()

    handle.setState({ count: 1 })
    expect(handle.getState()).toEqual({ count: 1, label: null })

    handle.setState({ label: 'a' })
    expect(handle.getState()).toEqual({ count: 1, label: 'a' })

    handle.setState({ count: 0, label: null })
    expect(handle.getState()).toEqual({ count: 0, label: null })
  })

  it('keeps the state reference stable until a value changes', () => {
    const handle = createHandle()
    const initial = handle.getState()

    handle.setState({ count: 0 })
    handle.setState({})
    expect(handle.getState()).toBe(initial)

    handle.setState({ count: 1 })
    const next = handle.getState()
    expect(next).not.toBe(initial)
    expect(next).toEqual({ count: 1, label: null })
  })

  it('notifies listeners with the new state when a value changes', () => {
    const handle = createHandle()
    const listener = vi.fn()
    handle.subscribe(listener)

    handle.setState({ count: 1 })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ count: 1, label: null })
  })

  it('notifies when only one of several values changes', () => {
    const handle = createHandle()
    handle.setState({ count: 1, label: 'a' })
    const listener = vi.fn()
    handle.subscribe(listener)

    handle.setState({ count: 1, label: 'b' })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ count: 1, label: 'b' })
  })

  it('does not notify when the update keeps every value identical', () => {
    const handle = createHandle()
    const listener = vi.fn()

    handle.setState({ count: 1, label: 'a' })
    handle.subscribe(listener)

    handle.setState({ count: 1 })
    handle.setState({ label: 'a' })
    handle.setState({})

    expect(listener).not.toHaveBeenCalled()
  })

  it('compares values by reference, not by shape', () => {
    const handle = createComposerHandle<{ value: object | null }>({ value: null })
    const listener = vi.fn()
    handle.subscribe(listener)

    handle.setState({ value: {} })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies every subscriber and stops each after unsubscribe', () => {
    const handle = createHandle()
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = handle.subscribe(first)
    handle.subscribe(second)

    handle.setState({ count: 1 })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    unsubscribeFirst()
    handle.setState({ count: 2 })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('treats a repeated unsubscribe as a no-op', () => {
    const handle = createHandle()
    const listener = vi.fn()
    const unsubscribe = handle.subscribe(listener)

    unsubscribe()
    unsubscribe()
    handle.setState({ count: 1 })

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('createComposerHandleBinding', () => {
  it('useHandle falls back to a module-default handle outside any provider', () => {
    const binding = createBinding()

    const { result } = renderHook(() => binding.useHandle())

    expect(result.current.getState()).toEqual({ count: 0, label: null })
  })

  it('useHandle returns the provider-created instance when one is provided', () => {
    const binding = createBinding()
    const handle = createHandle()

    const { result } = renderHook(() => binding.useHandle(), { wrapper: handleWrapper(binding, handle) })

    expect(result.current).toBe(handle)
  })

  it('gives each binding its own module-default fallback', () => {
    const first = createBinding()
    const second = createBinding()

    const firstHandle = renderHook(() => first.useHandle()).result.current
    const secondHandle = renderHook(() => second.useHandle()).result.current

    expect(firstHandle).not.toBe(secondHandle)

    act(() => firstHandle.setState({ count: 1 }))
    expect(secondHandle.getState().count).toBe(0)
  })

  it('useHandleState returns the selected slice', () => {
    const binding = createBinding()
    const handle = createHandle()
    handle.setState({ count: 3, label: 'a' })

    const count = renderHook(() => binding.useHandleState((state) => state.count), {
      wrapper: handleWrapper(binding, handle),
    })
    const label = renderHook(() => binding.useHandleState((state) => state.label), {
      wrapper: handleWrapper(binding, handle),
    })

    expect(count.result.current).toBe(3)
    expect(label.result.current).toBe('a')
  })

  it('useHandleState re-renders only when the selected slice changes', () => {
    const binding = createBinding()
    const handle = createHandle()
    let renderCount = 0
    const { result } = renderHook(
      () => {
        renderCount += 1
        return binding.useHandleState((state) => state.count)
      },
      { wrapper: handleWrapper(binding, handle) },
    )

    expect(result.current).toBe(0)
    expect(renderCount).toBe(1)

    // an unrelated slice changing must not re-render this subscriber
    act(() => handle.setState({ label: 'a' }))
    expect(renderCount).toBe(1)
    expect(result.current).toBe(0)

    act(() => handle.setState({ count: 1 }))
    expect(renderCount).toBe(2)
    expect(result.current).toBe(1)
  })

  it('useHandleState stops re-rendering after unmount', () => {
    const binding = createBinding()
    const handle = createHandle()
    let renderCount = 0
    const { unmount } = renderHook(
      () => {
        renderCount += 1
        return binding.useHandleState((state) => state.count)
      },
      { wrapper: handleWrapper(binding, handle) },
    )

    unmount()
    act(() => handle.setState({ count: 1 }))

    expect(renderCount).toBe(1)
  })
})
