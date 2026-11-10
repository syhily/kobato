import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetTraceFacadeForTests,
  activeTraceIds,
  counter,
  histogram,
  installTraceDelegate,
  isTraceActive,
  isTraceDelegateInstalled,
  runInSpan,
  startSpan,
  uninstallTraceDelegate,
  withSpan,
  withSpanAsync,
  type Span,
  type SpanOptions,
  type TraceDelegate,
} from '@/server/infra/trace/facade'

interface SpanState {
  attributes: Record<string, unknown>
  status: { status: string; message?: string } | undefined
  errors: unknown[]
  ended: number
}

function recordingSpan(): { span: Span; state: SpanState } {
  const state: SpanState = {
    attributes: {},
    status: undefined,
    errors: [],
    ended: 0,
  }
  const span: Span = {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    setAttribute(key, value) {
      state.attributes[key] = value
    },
    setAttributes(attributes) {
      Object.assign(state.attributes, attributes)
    },
    setStatus(status, message) {
      state.status = { status, message }
    },
    recordError(error) {
      state.errors.push(error)
    },
    end() {
      state.ended += 1
    },
  }
  return { span, state }
}

function recordingDelegate(overrides: Partial<TraceDelegate> = {}): {
  delegate: TraceDelegate
  span: Span
  state: SpanState
  startSpan: ReturnType<typeof vi.fn>
} {
  const { span, state } = recordingSpan()
  const startSpan = vi.fn((_name: string, _options?: SpanOptions) => span)
  const delegate: TraceDelegate = {
    startSpan,
    runInSpan: <T>(_span: Span, fn: () => T): T => fn(),
    activeTraceIds: () => ({ traceId: span.traceId, spanId: span.spanId, traceFlags: 1 }),
    ...overrides,
  }
  return { delegate, span, state, startSpan }
}

/** A delegate whose span is instrumented and whose runInSpan behaviour is scripted. */
function scriptedDelegate(runInSpan: (span: Span, fn: () => unknown) => unknown): {
  delegate: TraceDelegate
  state: SpanState
} {
  const { span, state } = recordingSpan()
  return {
    state,
    delegate: {
      startSpan: () => span,
      runInSpan: runInSpan as TraceDelegate['runInSpan'],
      activeTraceIds: () => null,
    },
  }
}

beforeEach(() => {
  __resetTraceFacadeForTests()
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
})

afterEach(() => {
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('trace facade — inert pass-through', () => {
  it('runs the sync callback with a no-op span before any initialization', () => {
    const spanCalls: string[] = []

    const result = withSpan('test.span', (span) => {
      spanCalls.push(span.traceId, span.spanId)
      span.setAttribute('key', 'value')
      span.setAttributes({ other: 1 })
      span.setStatus('ok')
      span.recordError(new Error('ignored'))
      span.end()
      return 42
    })

    expect(result).toBe(42)
    expect(spanCalls).toEqual(['', ''])
    expect(activeTraceIds()).toBeNull()
    expect(isTraceActive()).toBe(false)
    expect(isTraceDelegateInstalled()).toBe(false)
  })

  it('runs the async callback with a no-op span and preserves resolution', async () => {
    await expect(
      withSpanAsync('test.async', async (span) => {
        expect(span.traceId).toBe('')
        return 'done'
      }),
    ).resolves.toBe('done')
  })

  it('propagates application errors in the inert path', async () => {
    const error = new Error('application failure')

    expect(() =>
      withSpan('test.sync', () => {
        throw error
      }),
    ).toThrow(error)
    await expect(
      withSpanAsync('test.async', async () => {
        throw error
      }),
    ).rejects.toBe(error)
  })

  it('returns no-op metric instruments before initialization', () => {
    expect(() => counter('test.counter').add(1)).not.toThrow()
    expect(() => histogram('test.histogram').record(1)).not.toThrow()
  })
})

describe('trace facade — DEV delegate installation', () => {
  it('installs a delegate in development and routes spans and metrics through it', () => {
    const counterAdd = vi.fn()
    const histogramRecord = vi.fn()
    const { delegate, span, state } = recordingDelegate({
      counter: () => ({ add: counterAdd }),
      histogram: () => ({ record: histogramRecord }),
    })

    expect(installTraceDelegate(delegate)).toBe(true)
    expect(isTraceDelegateInstalled()).toBe(true)

    const result = withSpan('http.request', { kind: 'server', attributes: { 'http.method': 'GET' } }, (active) => {
      expect(active.traceId).toBe(span.traceId)
      return active.spanId
    })

    expect(result).toBe(span.spanId)
    expect(state.ended).toBe(1)
    expect(activeTraceIds()).toEqual({ traceId: span.traceId, spanId: span.spanId, traceFlags: 1 })

    counter('http.server.count').add(1, { route: 'posts.detail' })
    histogram('http.server.duration').record(12, { route: 'posts.detail' })
    expect(counterAdd).toHaveBeenCalledWith(1, { route: 'posts.detail' })
    expect(histogramRecord).toHaveBeenCalledWith(12, { route: 'posts.detail' })
  })

  it('passes span options to startSpan and ends the span exactly once', () => {
    const { delegate, startSpan, state } = recordingDelegate()
    installTraceDelegate(delegate)

    withSpan('ssr.shell', { kind: 'server', attributes: { 'ssr.kind': 'shell' } }, () => 'ok')
    withSpan('ssr.stream', () => 'ok')

    expect(startSpan).toHaveBeenNthCalledWith(1, 'ssr.shell', {
      kind: 'server',
      attributes: { 'ssr.kind': 'shell' },
    })
    expect(startSpan).toHaveBeenNthCalledWith(2, 'ssr.stream', undefined)
    expect(state.ended).toBe(2)
  })

  it('records the application error and still propagates it', () => {
    const { delegate, state } = recordingDelegate()
    installTraceDelegate(delegate)
    const error = new Error('boom')

    expect(() =>
      withSpan('failing.span', () => {
        throw error
      }),
    ).toThrow(error)

    expect(state.errors).toEqual([error])
    expect(state.status).toEqual({ status: 'error', message: undefined })
    expect(state.ended).toBe(1)
  })

  it('awaits async callbacks and propagates rejections', async () => {
    const { delegate, state } = recordingDelegate()
    installTraceDelegate(delegate)

    await expect(withSpanAsync('async.span', async () => 'value')).resolves.toBe('value')
    expect(state.ended).toBe(1)

    const error = new Error('async boom')
    await expect(
      withSpanAsync('async.failing', async () => {
        throw error
      }),
    ).rejects.toBe(error)
    expect(state.errors).toEqual([error])
    expect(state.ended).toBe(2)
  })

  it('hands the delegate its own span object while the callback receives a guarded wrapper', () => {
    const { span } = recordingSpan()
    let delegateSpan: Span | undefined
    let callbackSpan: Span | undefined
    const delegate: TraceDelegate = {
      startSpan: () => span,
      runInSpan: <T>(activeSpan: Span, fn: () => T): T => {
        delegateSpan = activeSpan
        return fn()
      },
      activeTraceIds: () => null,
    }
    installTraceDelegate(delegate)

    withSpan('identity.span', (active) => {
      callbackSpan = active
    })

    expect(delegateSpan).toBe(span)
    expect(callbackSpan).not.toBe(span)
    expect(callbackSpan?.traceId).toBe(span.traceId)
  })

  it('is idempotent for the same delegate and only uninstalls a matching delegate', () => {
    const first = recordingDelegate().delegate
    const second = recordingDelegate().delegate

    expect(installTraceDelegate(first)).toBe(true)
    expect(installTraceDelegate(first)).toBe(true)
    expect(uninstallTraceDelegate(second)).toBe(false)
    expect(isTraceDelegateInstalled()).toBe(true)
    expect(uninstallTraceDelegate(first)).toBe(true)
    expect(isTraceDelegateInstalled()).toBe(false)
    expect(uninstallTraceDelegate()).toBe(false)
  })

  it('a replacement delegate takes over immediately', () => {
    const first = recordingDelegate()
    installTraceDelegate(first.delegate)
    const second = recordingDelegate()
    installTraceDelegate(second.delegate)

    withSpan('replaced.span', () => undefined)

    expect(first.startSpan).not.toHaveBeenCalled()
    expect(second.startSpan).toHaveBeenCalledWith('replaced.span', undefined)
  })
})

describe('trace facade — failure isolation', () => {
  it('falls back to passthrough when startSpan throws', () => {
    const { delegate } = recordingDelegate({
      startSpan: () => {
        throw new Error('exporter unavailable')
      },
    })
    installTraceDelegate(delegate)
    const callback = vi.fn(() => 'ok')

    expect(withSpan('broken.span', callback)).toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('falls back to passthrough when runInSpan throws before invoking the callback', () => {
    const { delegate } = recordingDelegate({
      runInSpan: () => {
        throw new Error('context failure')
      },
    })
    installTraceDelegate(delegate)
    const callback = vi.fn(() => 'ok')

    expect(withSpan('broken.context', callback)).toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('never lets span method failures escape into application code', () => {
    const brokenSpan: Span = {
      get traceId(): string {
        throw new Error('traceId failure')
      },
      get spanId(): string {
        throw new Error('spanId failure')
      },
      setAttribute() {
        throw new Error('attribute failure')
      },
      setAttributes() {
        throw new Error('attributes failure')
      },
      setStatus() {
        throw new Error('status failure')
      },
      recordError() {
        throw new Error('record failure')
      },
      end() {
        throw new Error('end failure')
      },
    }
    const { delegate } = recordingDelegate({ startSpan: () => brokenSpan })
    installTraceDelegate(delegate)
    const error = new Error('application failure')

    const result = withSpan('hostile.span', (span) => {
      expect(span.traceId).toBe('')
      expect(span.spanId).toBe('')
      expect(() => span.setAttribute('a', 1)).not.toThrow()
      expect(() => span.setAttributes({ a: 1 })).not.toThrow()
      expect(() => span.setStatus('ok')).not.toThrow()
      expect(() => span.recordError(new Error('inner'))).not.toThrow()
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(() =>
      withSpan('hostile.failing', (span) => {
        span.setAttribute('a', 1)
        throw error
      }),
    ).toThrow(error)
  })

  it('returns null when activeTraceIds throws', () => {
    const { delegate } = recordingDelegate({
      activeTraceIds: () => {
        throw new Error('context failure')
      },
    })
    installTraceDelegate(delegate)

    expect(activeTraceIds()).toBeNull()
  })

  it('degrades broken metric instruments to no-ops', () => {
    const { delegate } = recordingDelegate({
      counter: () => {
        throw new Error('counter failure')
      },
      histogram: () => ({
        record() {
          throw new Error('record failure')
        },
      }),
    })
    installTraceDelegate(delegate)

    expect(() => counter('broken.counter').add(1)).not.toThrow()
    expect(() => histogram('broken.histogram').record(1)).not.toThrow()
  })
})

describe('trace facade — delegate lifecycle failures', () => {
  it('ends the created span exactly once when runInSpan throws before the callback', () => {
    const { delegate, state } = scriptedDelegate(() => {
      throw new Error('context failure')
    })
    installTraceDelegate(delegate)
    const callback = vi.fn(() => 'ok')

    expect(withSpan('broken.context', callback)).toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.ended).toBe(1)
  })

  it('ends the span and passthrough-runs once when runInSpan never invokes the callback', () => {
    const { delegate, state } = scriptedDelegate(() => 'delegate returned early')
    installTraceDelegate(delegate)
    const callback = vi.fn(() => 'ok')

    expect(withSpan('skipped.context', callback)).toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.ended).toBe(1)
  })

  it('keeps a successful result when the delegate throws during cleanup', () => {
    const { delegate, state } = scriptedDelegate((_span, fn) => {
      fn()
      throw new Error('cleanup failure')
    })
    installTraceDelegate(delegate)

    expect(withSpan('cleanup.span', () => 'result')).toBe('result')
    expect(state.ended).toBe(1)
  })

  it('preserves the application error when the delegate also throws during cleanup', () => {
    const applicationError = new Error('application failure')
    const { delegate, state } = scriptedDelegate((_span, fn) => {
      try {
        return fn()
      } catch {
        throw new Error('cleanup failure')
      }
    })
    installTraceDelegate(delegate)

    expect(() =>
      withSpan('cleanup.failing', () => {
        throw applicationError
      }),
    ).toThrow(applicationError)
    expect(state.ended).toBe(1)
  })

  it('ends the created span exactly once when async runInSpan throws before the callback', async () => {
    const { delegate, state } = scriptedDelegate(() => {
      throw new Error('context failure')
    })
    installTraceDelegate(delegate)
    const callback = vi.fn(async () => 'ok')

    await expect(withSpanAsync('broken.context', callback)).resolves.toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.ended).toBe(1)
  })

  it('ends the span and passthrough-runs once when async runInSpan never invokes the callback', async () => {
    const { delegate, state } = scriptedDelegate(() => 'delegate returned early')
    installTraceDelegate(delegate)
    const callback = vi.fn(async () => 'ok')

    await expect(withSpanAsync('skipped.context', callback)).resolves.toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.ended).toBe(1)
  })

  it('keeps a successful async result when the delegate throws during cleanup', async () => {
    const { delegate, state } = scriptedDelegate(async (_span, fn) => {
      await fn()
      throw new Error('cleanup failure')
    })
    installTraceDelegate(delegate)

    await expect(withSpanAsync('cleanup.async', async () => 'result')).resolves.toBe('result')
    expect(state.ended).toBe(1)
  })

  it('preserves the async application error when the delegate also throws during cleanup', async () => {
    const applicationError = new Error('application failure')
    const { delegate, state } = scriptedDelegate(async (_span, fn) => {
      try {
        await fn()
      } catch {
        throw new Error('cleanup failure')
      }
      throw new Error('unreachable')
    })
    installTraceDelegate(delegate)

    await expect(
      withSpanAsync('cleanup.async.failing', async () => {
        throw applicationError
      }),
    ).rejects.toBe(applicationError)
    expect(state.ended).toBe(1)
  })

  it('awaits a callback promise the delegate invoked but did not return', async () => {
    const { delegate, state } = scriptedDelegate((_span, fn) => {
      void fn()
      return undefined
    })
    installTraceDelegate(delegate)

    await expect(withSpanAsync('detached.async', async () => 'result')).resolves.toBe('result')
    expect(state.ended).toBe(1)
  })
})

describe('trace facade — installation is runtime-owned, not build-gated', () => {
  it('installs and routes in a production build (the settings gate lives upstream)', () => {
    vi.stubEnv('DEV', false as never)
    vi.stubEnv('PROD', true as never)
    const { delegate, startSpan } = recordingDelegate()

    expect(installTraceDelegate(delegate)).toBe(true)
    expect(isTraceDelegateInstalled()).toBe(true)

    expect(withSpan('production.span', () => 'ok')).toBe('ok')
    expect(startSpan).toHaveBeenCalledTimes(1)
  })

  it('stays inert until a delegate is installed', () => {
    vi.stubEnv('PROD', true as never)

    expect(isTraceDelegateInstalled()).toBe(false)
    expect(isTraceActive()).toBe(false)
    expect(activeTraceIds()).toBeNull()
  })
})

describe('trace facade — manual span lifecycle', () => {
  it('returns a no-op span with idempotent end before initialization', () => {
    const span = startSpan('manual.inert')

    expect(span.traceId).toBe('')
    expect(() => span.end()).not.toThrow()
    expect(() => span.end()).not.toThrow()
    expect(runInSpan(span, () => 7)).toBe(7)
  })

  it('starts a delegate span and ends it exactly once', () => {
    const { delegate, startSpan: startSpanMock, state } = recordingDelegate()
    installTraceDelegate(delegate)

    const span = startSpan('ssr.shell', { kind: 'internal', attributes: { 'ssr.phase': 'shell' } })
    span.setAttribute('ssr.phase', 'stream')
    span.end()
    span.end()

    expect(startSpanMock).toHaveBeenCalledWith('ssr.shell', {
      kind: 'internal',
      attributes: { 'ssr.phase': 'shell' },
    })
    expect(state.attributes).toEqual({ 'ssr.phase': 'stream' })
    expect(state.ended).toBe(1)
  })

  it('installs the ORIGINAL span as the active delegate context via runInSpan', () => {
    const { delegate, span } = recordingDelegate()
    let delegateSpan: Span | undefined
    installTraceDelegate({
      ...delegate,
      runInSpan: <T>(activeSpan: Span, fn: () => T): T => {
        delegateSpan = activeSpan
        return fn()
      },
    })

    const guarded = startSpan('parent.span')
    expect(runInSpan(guarded, () => 'result')).toBe('result')
    expect(delegateSpan).toBe(span)
    expect(delegateSpan).not.toBe(guarded)
  })

  it('propagates results and application errors from runInSpan', () => {
    const { delegate } = recordingDelegate()
    installTraceDelegate(delegate)
    const span = startSpan('run.span')
    const error = new Error('application failure')

    expect(runInSpan(span, () => 'ok')).toBe('ok')
    expect(() =>
      runInSpan(span, () => {
        throw error
      }),
    ).toThrow(error)
  })

  it('runs the callback once when the delegate context fails before invoking it', () => {
    const { delegate } = recordingDelegate({
      runInSpan: () => {
        throw new Error('context failure')
      },
    })
    installTraceDelegate(delegate)
    const span = startSpan('broken.run')
    const callback = vi.fn(() => 'ok')

    expect(runInSpan(span, callback)).toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('degrades to a plain call for spans not created by the facade', () => {
    const { delegate } = recordingDelegate()
    installTraceDelegate(delegate)
    const foreignSpan: Span = {
      traceId: '',
      spanId: '',
      setAttribute: () => undefined,
      setAttributes: () => undefined,
      setStatus: () => undefined,
      recordError: () => undefined,
      end: () => undefined,
    }

    const callback = vi.fn(() => 'ok')
    expect(runInSpan(foreignSpan, callback)).toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('returns the async callback promise unchanged', async () => {
    const { delegate, state } = recordingDelegate()
    installTraceDelegate(delegate)
    const span = startSpan('async.run')

    await expect(
      runInSpan(span, async () => {
        await Promise.resolve()
        return 'value'
      }),
    ).resolves.toBe('value')

    runInSpan(span, () => span.end())
    expect(state.ended).toBe(1)
  })

  it('falls back to a no-op span when the delegate start throws', () => {
    const { delegate } = recordingDelegate({
      startSpan: () => {
        throw new Error('provider unavailable')
      },
    })
    installTraceDelegate(delegate)

    const span = startSpan('broken.start')
    expect(span.traceId).toBe('')
    expect(() => span.end()).not.toThrow()
  })
})

describe('trace facade — manual runInSpan async isolation', () => {
  it('returns the application result when the delegate rejects after the async callback settles', async () => {
    const { delegate, state } = recordingDelegate({
      runInSpan: (async <T>(_span: Span, fn: () => T): Promise<T> => {
        await fn()
        throw new Error('telemetry cleanup failure')
      }) as unknown as TraceDelegate['runInSpan'],
    })
    installTraceDelegate(delegate)
    const span = startSpan('manual.async.success')

    await expect(
      runInSpan(span, async () => {
        await Promise.resolve()
        return 'app-result'
      }),
    ).resolves.toBe('app-result')

    // Manual spans belong to the caller: runInSpan must never end them.
    expect(state.ended).toBe(0)
  })

  it('preserves the application error when the delegate rejects with a different error', async () => {
    const applicationError = new Error('application failure')
    const { delegate, state } = recordingDelegate({
      runInSpan: (async <T>(_span: Span, fn: () => T): Promise<T> => {
        try {
          return await fn()
        } catch {
          throw new Error('telemetry cleanup failure')
        }
      }) as unknown as TraceDelegate['runInSpan'],
    })
    installTraceDelegate(delegate)
    const span = startSpan('manual.async.failure')

    await expect(
      runInSpan(span, async () => {
        throw applicationError
      }),
    ).rejects.toBe(applicationError)
    expect(state.ended).toBe(0)
  })

  it('runs the callback exactly once when the delegate async rejects before invoking it', async () => {
    const { delegate, state } = recordingDelegate({
      runInSpan: (async <T>(_span: Span, _fn: () => T): Promise<T> => {
        throw new Error('context failure')
      }) as unknown as TraceDelegate['runInSpan'],
    })
    installTraceDelegate(delegate)
    const span = startSpan('manual.async.not-invoked')
    const callback = vi.fn(async () => 'passthrough')

    await expect(runInSpan(span, callback)).resolves.toBe('passthrough')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.ended).toBe(0)
  })

  it('runs the callback exactly once when the delegate returns a thenable without invoking it', async () => {
    const { delegate, state } = recordingDelegate({
      runInSpan: <T>(_span: Span, _fn: () => T): T => Promise.resolve('delegate value') as unknown as T,
    })
    installTraceDelegate(delegate)
    const span = startSpan('manual.async.skipped')
    const callback = vi.fn(async () => 'passthrough')

    await expect(runInSpan(span, callback)).resolves.toBe('passthrough')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.ended).toBe(0)
  })

  it('settles an async callback once when the delegate throws synchronously during cleanup', async () => {
    const { delegate, state } = recordingDelegate({
      runInSpan: <T>(_span: Span, fn: () => T): T => {
        fn()
        throw new Error('telemetry cleanup failure')
      },
    })
    installTraceDelegate(delegate)
    const span = startSpan('manual.async.sync-cleanup')
    const callback = vi.fn(async () => 'app-result')

    await expect(runInSpan(span, callback)).resolves.toBe('app-result')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.ended).toBe(0)
  })

  it('settles an async callback once when the delegate returns a non-thenable without it', async () => {
    const { delegate, state } = recordingDelegate({
      runInSpan: <T>(_span: Span, fn: () => T): T => {
        fn()
        return undefined as unknown as T
      },
    })
    installTraceDelegate(delegate)
    const span = startSpan('manual.async.non-thenable')
    const callback = vi.fn(async () => 'app-result')

    await expect(runInSpan(span, callback)).resolves.toBe('app-result')
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.ended).toBe(0)
  })

  it('keeps the normal async parent context and result unchanged', async () => {
    const { delegate, span } = recordingDelegate()
    let delegateSpan: Span | undefined
    installTraceDelegate({
      ...delegate,
      runInSpan: <T>(activeSpan: Span, fn: () => T): T => {
        delegateSpan = activeSpan
        return fn()
      },
    })

    const guarded = startSpan('manual.async.context')
    await expect(runInSpan(guarded, async () => 'value')).resolves.toBe('value')

    expect(delegateSpan).toBe(span)
    expect(delegateSpan).not.toBe(guarded)
  })
})
