import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { debounce, throttle } from '@/utils/timing'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes on the trailing edge only by default', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('coalesces rapid calls and passes the last arguments through', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('first')
    vi.advanceTimersByTime(50)
    debounced('second')
    vi.advanceTimersByTime(50)
    debounced('third')
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('third')
  })

  it('cancel() drops the pending invocation', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('value')
    debounced.cancel()
    vi.advanceTimersByTime(1000)

    expect(fn).not.toHaveBeenCalled()
  })

  it('supports leading + trailing options', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100, { leading: true, trailing: true })

    // leading edge: single call invokes immediately, exactly once
    debounced('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)

    // a call inside the window schedules a trailing invoke with the last args
    debounced('b')
    expect(fn).toHaveBeenCalledTimes(2)
    debounced('c')
    expect(fn).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn).toHaveBeenLastCalledWith('c')
  })
})

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes on the leading edge and again on the trailing edge within the window', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')

    throttled('b')
    throttled('c')
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('c')
  })

  it('invokes on the leading edge again once the window has passed', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)

    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cancel() drops the pending trailing invocation', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('a')
    throttled('b')
    throttled.cancel()
    vi.advanceTimersByTime(1000)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('clears the stale pending timer when re-invoking in a tight loop (maxing)', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)

    throttled('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    // the clock jumps past maxWait while the first timer is still pending
    // (event-loop lag), so the maxing branch re-invokes in a tight loop;
    // it must clear the stale timer before scheduling the new one
    vi.setSystemTime(150)
    throttled('b')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)

    // cancel() only clears the current timerId, so a stale timer left over
    // from the maxing branch would survive it
    throttled.cancel()
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
