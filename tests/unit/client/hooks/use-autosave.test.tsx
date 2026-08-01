import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { useAutosave } from '@/client/hooks/use-autosave'

// useAutosave is a hook whose observable surface is the `forceFlush`
// callback it returns and the `onStatusChange` callback the caller
// passes in. The renderHook harness renders synchronously once (so
// effects do not fire), but `forceFlush` and `doFlush` are
// user-triggered async paths we can drive directly. These cases
// exercise the disabled short-circuit, the no-change short-circuit,
// the saving/saved lifecycle, and the retry ladder.

const sampleBody = [
  { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'hi' }] },
]

describe('useAutosave — disabled / no-op paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forceFlush resolves without invoking flush when disabled', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: false,
        flush: flush as never,
      }),
    )
    await result.forceFlush()
    expect(flush).not.toHaveBeenCalled()
  })

  it('forceFlush does not call flush when the body has not changed since the last persist', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
      }),
    )
    // First flush should persist the body.
    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)
    // Second flush with the same body reference should short-circuit.
    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)
  })
})

describe('useAutosave — saving lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits saving then saved on a successful flush', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const statuses: string[] = []
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
        onStatusChange: (s) => statuses.push(s.kind),
      }),
    )
    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(expect.arrayContaining(['saving', 'saved']))
  })

  it('does not invoke onStatusChange when no callback is supplied (defensive branch)', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
      }),
    )
    // Should simply not throw.
    await expect(result.forceFlush()).resolves.toBeUndefined()
    expect(flush).toHaveBeenCalledTimes(1)
  })
})

describe('useAutosave — conflict outcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits no saved tick and does not advance the baseline on a conflict flush', async () => {
    const flush = vi.fn<(body: unknown) => Promise<'saved' | 'conflict'>>().mockResolvedValue('conflict')
    const statuses: string[] = []
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
        onStatusChange: (s) => statuses.push(s.kind),
      }),
    )

    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(statuses).toContain('saving')
    // A 'saved' tick here would clobber the conflict state the flush surfaced.
    expect(statuses).not.toContain('saved')

    // The baseline never advanced: the same body flushes again rather than
    // short-circuiting (the persist layer's `enabled` gate is what freezes
    // automatic flushes after a conflict).
    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(2)
  })
})

describe('useAutosave — markPersisted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('advances the baseline so the next tick short-circuits instead of re-flushing the same body', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
      }),
    )
    // A manual Ctrl+S save persisted the current body outside the engine.
    result.markPersisted(sampleBody as never)
    // The next debounce tick hits the same reference check forceFlush uses.
    await result.forceFlush()
    expect(flush).not.toHaveBeenCalled()
  })

  it('still flushes a body that changed after markPersisted', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
      }),
    )
    // Marking a stale snapshot persisted must not swallow real changes:
    // the current body differs from the marked reference, so it flushes.
    result.markPersisted([{ _type: 'block', _key: 'old' }] as never)
    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(sampleBody)
  })
})

describe('useAutosave — retry kick-off', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('emits a retrying status on the first failure with the cause message', async () => {
    const cause = new Error('network down')
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockRejectedValue(cause)
    const statuses: Array<{ kind: string; attempt?: number; message?: string }> = []
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
        retryDelaysMs: [10, 20, 30],
        onStatusChange: (s) => statuses.push(s),
      }),
    )

    await result.forceFlush()

    // The first failure schedules a retry — assert the retrying event
    // fires with attempt === 1 and the cause message copied through.
    expect(flush).toHaveBeenCalledTimes(1)
    expect(statuses.some((s) => s.kind === 'saving')).toBe(true)
    expect(statuses.some((s) => s.kind === 'retrying' && s.attempt === 1 && s.message === 'network down')).toBe(true)
  })

  it('wraps a non-Error cause with the generic 保存失败 message', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockRejectedValue('boom-string')
    const statuses: Array<{ kind: string; message?: string }> = []
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
        retryDelaysMs: [5],
        onStatusChange: (s) => statuses.push(s),
      }),
    )

    await result.forceFlush()

    expect(statuses.some((s) => s.message === '保存失败')).toBe(true)
  })
})
