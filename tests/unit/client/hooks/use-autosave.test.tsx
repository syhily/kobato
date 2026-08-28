// @vitest-environment happy-dom

import { renderHook as renderDomHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import { DEFAULT_RETRY_DELAYS_MS, useAutosave } from '@/client/hooks/use-autosave'

// The SSR harness renders synchronously once (effects never fire), so
// the tests drive the user-triggered forceFlush / doFlush paths directly.

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
    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)
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
    // A 'saved' tick would clobber the conflict state the flush surfaced.
    expect(statuses).not.toContain('saved')

    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(2)
  })
})

describe('useAutosave — setBaseline', () => {
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
    result.setBaseline(sampleBody as never)
    await result.forceFlush()
    expect(flush).not.toHaveBeenCalled()
  })

  it('still flushes a body that changed after setBaseline', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
      }),
    )
    result.setBaseline([{ _type: 'block', _key: 'old' }] as never)
    await result.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(sampleBody)
  })
})

describe('useAutosave — initialBaseline seed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with the seed as the persisted baseline so the first tick is a no-op', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const result = renderHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
        initialBaseline: sampleBody as never,
      }),
    )
    await result.forceFlush()
    expect(flush).not.toHaveBeenCalled()
  })

  it('ignores a changed initialBaseline after mount — setBaseline is the only later advance', async () => {
    const flush = vi.fn<(body: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const otherBody = [
      { _type: 'block', _key: 'b2', style: 'normal', children: [{ _type: 'span', _key: 's2', text: 'other' }] },
    ]
    const { result, rerender } = renderDomHook(
      (props: { seed: unknown }) =>
        useAutosave({
          body: sampleBody as never,
          enabled: true,
          flush: flush as never,
          initialBaseline: props.seed as never,
        }),
      { initialProps: { seed: sampleBody } },
    )
    rerender({ seed: otherBody })
    await result.current.forceFlush()
    expect(flush).not.toHaveBeenCalled()
  })
})

describe('useAutosave — retry kick-off', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
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

    // First failure → retrying with attempt === 1 and the cause message.
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

  it('re-fires the flush after the scheduled delay and lands on saved', async () => {
    // Retry timers need a real DOM render — the SSR harness never fires effects.
    const flush = vi
      .fn<(body: unknown) => Promise<void>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined)
    const statuses: Array<{ kind: string; attempt?: number; message?: string }> = []
    const { result } = renderDomHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
        retryDelaysMs: [10, 20, 30],
        onStatusChange: (s) => statuses.push(s),
      }),
    )

    await result.current.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(statuses.map((s) => s.kind)).toEqual(['saving', 'retrying'])
    expect(statuses[1]).toMatchObject({ attempt: 1, message: 'network down' })

    // Timer-scheduled: before the delay elapses, the flush has NOT re-fired.
    await vi.advanceTimersByTimeAsync(9)
    expect(flush).toHaveBeenCalledTimes(1)

    // At the delay boundary the retry re-fires with the same body.
    await vi.advanceTimersByTimeAsync(1)
    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush).toHaveBeenNthCalledWith(2, sampleBody)

    expect(statuses.map((s) => s.kind)).toEqual(['saving', 'retrying', 'saving', 'saved'])
  })
})

describe('useAutosave — overlapping in-flight triggers (V3-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not re-flush the same body when a second trigger fires while the first flush is in flight', async () => {
    // Overlapping triggers must not re-PATCH the same body.
    let resolveFlush!: () => void
    const flush = vi
      .fn<(body: unknown) => Promise<void>>()
      .mockImplementation(() => new Promise<void>((resolve) => (resolveFlush = resolve)))
    const { result } = renderDomHook(() =>
      useAutosave({
        body: sampleBody as never,
        enabled: true,
        flush: flush as never,
      }),
    )

    const first = result.current.forceFlush()
    expect(flush).toHaveBeenCalledTimes(1)

    // Second trigger via the pagehide listener; its doFlush parks on the in-flight promise.
    window.dispatchEvent(new Event('pagehide'))

    resolveFlush()
    await first
    // Let the parked doFlush continuation run its post-await re-check.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(flush).toHaveBeenCalledTimes(1)
  })
})

describe('useAutosave — default retry ladder (fix-review)', () => {
  it('pins the 1s / 3s / 9s backoff the editor ships with', () => {
    // The default ladder is the retry UX contract — pin it against silent edits.
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([1_000, 3_000, 9_000])
  })
})
