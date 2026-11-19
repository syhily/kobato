// @vitest-environment happy-dom

import { useDebouncedSearch } from '@kobato/ui/lib/use-debounced-search.ts'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Real timers replaced everywhere: the hook's whole contract is the trailing-edge window.
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ui/shared/use-debounced-search', () => {
  it('binds the value immediately and fires onChange once after the window', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useDebouncedSearch({ delayMs: 300, onChange }))
    expect(result.current[0]).toBe('')

    act(() => {
      result.current[1]('kobato')
    })
    expect(result.current[0]).toBe('kobato')
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('kobato')
  })

  it('collapses a keystroke burst into the last value', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useDebouncedSearch({ delayMs: 300, onChange }))

    // Typing before the mount leg elapses cancels it, so only the final value fires.
    act(() => {
      result.current[1]('科')
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    act(() => {
      result.current[1]('科大')
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    act(() => {
      result.current[1]('科大量')
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('科大量')
  })

  it('honors a fresh onChange closure without resetting the window', () => {
    const first = vi.fn()
    const second = vi.fn()
    let change = first
    const { result, rerender } = renderHook(() =>
      useDebouncedSearch({
        delayMs: 300,
        onChange: (value: string) => change(value),
      }),
    )
    act(() => {
      result.current[1]('k')
    })
    change = second
    rerender()
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('k')
  })

  it('rebinds the input when the initial value changes externally', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ initial }: { initial: string }) => useDebouncedSearch({ initial, delayMs: 300, onChange }),
      { initialProps: { initial: 'url-q' } },
    )
    expect(result.current[0]).toBe('url-q')

    act(() => {
      result.current[1]('typed')
    })
    expect(result.current[0]).toBe('typed')

    // Back/forward updates the URL param, and the input follows the new external value.
    rerender({ initial: 'back-forward' })
    expect(result.current[0]).toBe('back-forward')
  })

  it('echoes the initial value through the mount effect after the window', () => {
    const onChange = vi.fn()
    renderHook(() => useDebouncedSearch({ initial: 'seeded', delayMs: 300, onChange }))
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('seeded')
  })

  it('defaults to a 250ms window and an empty initial value', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useDebouncedSearch({ onChange }))

    act(() => {
      result.current[1]('late')
    })
    act(() => {
      vi.advanceTimersByTime(249)
    })
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onChange).toHaveBeenCalledWith('late')
  })
})
