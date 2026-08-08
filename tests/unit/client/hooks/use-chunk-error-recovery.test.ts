import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { subscribeChunkReload, useReloadOnChunkError } from '@/client/hooks/use-chunk-error-recovery'
import { isChunkLoadError } from '@/shared/utils/chunk-error'

// The hooks attach listeners in useEffect, which the SSR harness does
// not fire; the exported helpers are testable in isolation.

describe('shared/utils/chunk-error — isChunkLoadError', () => {
  it('returns false for null / undefined', () => {
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })

  it('returns false for non-string, non-object primitives', () => {
    expect(isChunkLoadError(123)).toBe(false)
    expect(isChunkLoadError(true)).toBe(false)
  })

  it('matches a known message needle (case-insensitive)', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: x')).toBe(true)
    expect(isChunkLoadError('ERROR LOADING DYNAMICALLY IMPORTED MODULE')).toBe(true)
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true)
    expect(isChunkLoadError('Loading CSS chunk 5 failed.')).toBe(true)
  })

  it('matches the "loading chunk ... failed" compound message', () => {
    expect(isChunkLoadError('Loading chunk 12 failed.')).toBe(true)
    expect(isChunkLoadError('loading chunk foo failed')).toBe(true)
  })

  it('does not match an unrelated message', () => {
    expect(isChunkLoadError('something else went wrong')).toBe(false)
    expect(isChunkLoadError('loading chunk 5')).toBe(false) // missing "failed"
    expect(isChunkLoadError('failed to load')).toBe(false) // missing chunk needle
  })

  it('matches an Error object with name === ChunkLoadError', () => {
    const err = new Error('boom')
    err.name = 'ChunkLoadError'
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('matches an Error object whose message contains a needle', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true)
  })

  it('returns false for an object without name or message', () => {
    expect(isChunkLoadError({})).toBe(false)
    expect(isChunkLoadError({ name: 123 })).toBe(false) // non-string name
    expect(isChunkLoadError({ message: 123 })).toBe(false) // non-string message
  })
})

describe('client/hooks/use-chunk-error-recovery — subscribeChunkReload', () => {
  it('returns an unsubscribe function', () => {
    const unsub = subscribeChunkReload(() => undefined)
    expect(unsub).toBeInstanceOf(Function)
    unsub()
  })

  it('unsubscribe removes the listener (idempotent, no throw on re-call)', () => {
    const listener = vi.fn()
    const unsub = subscribeChunkReload(listener)
    unsub()
    expect(() => unsub()).not.toThrow()
  })
})

describe('client/hooks/use-chunk-error-recovery — triggerChunkReload', () => {
  // The module-level latch is reset per case via vi.resetModules() + fresh import.

  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { reload: vi.fn() },
      // No sessionStorage -> the storage guard branch is skipped.
      sessionStorage: undefined,
      requestAnimationFrame: undefined,
      setTimeout: vi.fn(() => 0 as unknown as NodeJS.Timeout),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('notifies subscribed listeners', async () => {
    vi.resetModules()
    const mod = await import('@/client/hooks/use-chunk-error-recovery')
    const listener = vi.fn()
    const unsub = mod.subscribeChunkReload(listener)
    mod.triggerChunkReload()
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('survives a listener that throws (recovery must not be blocked)', async () => {
    vi.resetModules()
    const mod = await import('@/client/hooks/use-chunk-error-recovery')
    const good = vi.fn()
    const bad = vi.fn(() => {
      throw new Error('listener exploded')
    })
    const unsubBad = mod.subscribeChunkReload(bad)
    const unsubGood = mod.subscribeChunkReload(good)
    expect(() => mod.triggerChunkReload()).not.toThrow()
    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalled()
    unsubBad()
    unsubGood()
  })

  it('only fires listeners once across repeated calls (reload-started guard)', async () => {
    vi.resetModules()
    const mod = await import('@/client/hooks/use-chunk-error-recovery')
    const listener = vi.fn()
    const unsub = mod.subscribeChunkReload(listener)
    mod.triggerChunkReload()
    mod.triggerChunkReload()
    mod.triggerChunkReload()
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('schedules a reload via setTimeout when requestAnimationFrame is unavailable', async () => {
    vi.resetModules()
    const setTimeoutMock = vi.fn(() => 0 as unknown as NodeJS.Timeout)
    vi.stubGlobal('window', {
      location: { reload: vi.fn() },
      sessionStorage: undefined,
      requestAnimationFrame: undefined,
      setTimeout: setTimeoutMock,
    })
    const mod = await import('@/client/hooks/use-chunk-error-recovery')
    mod.triggerChunkReload()
    expect(setTimeoutMock).toHaveBeenCalled()
  })

  it('uses requestAnimationFrame when available', async () => {
    vi.resetModules()
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.stubGlobal('window', {
      location: { reload: vi.fn() },
      sessionStorage: undefined,
      requestAnimationFrame: raf,
      setTimeout: vi.fn(() => 0 as unknown as NodeJS.Timeout),
    })
    const mod = await import('@/client/hooks/use-chunk-error-recovery')
    mod.triggerChunkReload()
    // rAF is double-nested in the source — assert at least one call.
    expect(raf).toHaveBeenCalled()
  })
})

describe('client/hooks/use-chunk-error-recovery — useReloadOnChunkError', () => {
  // The hook's effect never fires under the SSR harness — these cases pin the undefined return.
  it('returns undefined for a chunk-load error', () => {
    const result = renderHook(() => useReloadOnChunkError(new Error('Loading chunk 5 failed.')))
    expect(result).toBeUndefined()
  })

  it('returns undefined for a non-chunk error', () => {
    const result = renderHook(() => useReloadOnChunkError(new Error('unrelated')))
    expect(result).toBeUndefined()
  })

  it('returns undefined for a null error', () => {
    const result = renderHook(() => useReloadOnChunkError(null))
    expect(result).toBeUndefined()
  })
})
