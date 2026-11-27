import { subscribeChunkReload } from '@kobato/ui/lib/chunk-reload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('lib/chunk-reload — subscribeChunkReload', () => {
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

describe('lib/chunk-reload — triggerChunkReload', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { reload: vi.fn() },
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
    const mod = await import('@kobato/ui/lib/chunk-reload')
    const listener = vi.fn()
    const unsub = mod.subscribeChunkReload(listener)
    mod.triggerChunkReload()
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('survives a listener that throws (recovery must not be blocked)', async () => {
    vi.resetModules()
    const mod = await import('@kobato/ui/lib/chunk-reload')
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
    const mod = await import('@kobato/ui/lib/chunk-reload')
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
    const mod = await import('@kobato/ui/lib/chunk-reload')
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
    const mod = await import('@kobato/ui/lib/chunk-reload')
    mod.triggerChunkReload()
    expect(raf).toHaveBeenCalled()
  })
})
