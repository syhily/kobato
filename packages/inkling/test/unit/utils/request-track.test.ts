import { describe, expect, it, vi } from 'vitest'

import { createRequestTrack, defaultScheduler } from '@/utils/services/request-track'

function createManualScheduler() {
  const pending = new Map<number, () => void>()
  let nextId = 0
  return {
    schedule(fn: () => void) {
      nextId += 1
      const id = nextId
      pending.set(id, fn)
      return () => {
        pending.delete(id)
      }
    },
    flush() {
      const fns = [...pending.values()]
      pending.clear()
      for (const fn of fns) {
        fn()
      }
    },
    pendingCount: () => pending.size,
  }
}

describe('defaultScheduler', () => {
  it('runs the scheduled function and honours cancellation', () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      const cancel = defaultScheduler.schedule(fn, 100)
      vi.advanceTimersByTime(50)
      cancel()
      vi.advanceTimersByTime(100)
      expect(fn).not.toHaveBeenCalled()

      defaultScheduler.schedule(fn, 100)
      vi.advanceTimersByTime(100)
      expect(fn).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('createRequestTrack', () => {
  it('supersedes in-flight generations on next()', () => {
    const track = createRequestTrack()
    const first = track.next()
    expect(track.isLatest(first)).toBe(true)

    const second = track.next()
    expect(track.isLatest(first)).toBe(false)
    expect(track.isLatest(second)).toBe(true)
    expect(track.current()).toBe(second)
  })

  it('cancels the pending dispatch when a newer one is scheduled', () => {
    const scheduler = createManualScheduler()
    const track = createRequestTrack({ scheduler })
    const first = vi.fn()
    const second = vi.fn()

    track.schedule(first, 100)
    track.schedule(second, 100)
    scheduler.flush()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('cancelScheduled drops the pending dispatch without touching generations', () => {
    const scheduler = createManualScheduler()
    const track = createRequestTrack({ scheduler })
    const generation = track.next()
    const fn = vi.fn()

    track.schedule(fn, 100)
    track.cancelScheduled()
    scheduler.flush()

    expect(fn).not.toHaveBeenCalled()
    expect(track.isLatest(generation)).toBe(true)
  })

  it('dispose cancels the pending dispatch and supersedes every in-flight request', () => {
    const scheduler = createManualScheduler()
    const track = createRequestTrack({ scheduler })
    const generation = track.next()
    const fn = vi.fn()

    track.schedule(fn, 100)
    track.dispose()
    scheduler.flush()

    expect(fn).not.toHaveBeenCalled()
    expect(track.isLatest(generation)).toBe(false)
  })
})
