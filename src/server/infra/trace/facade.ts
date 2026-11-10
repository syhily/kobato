// No-OpenTelemetry-import tracing surface (ADR-0012).
//
// Application code depends on this facade only. Until an admin-configured
// runtime installs a delegate — and whenever tracing is disabled — every
// operation is a true pass-through: the callback still runs, metrics are
// no-ops, and no telemetry failure can ever propagate into request/rendering
// correctness.

import { getLogger } from '@/server/infra/logger'

const log = getLogger('trace')

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer'
export type SpanStatus = 'ok' | 'error'
export type SpanAttributeValue = string | number | boolean | null | undefined
export type SpanAttributes = Readonly<Record<string, SpanAttributeValue>>
export type MetricAttributes = Readonly<Record<string, string | number | boolean>>

/**
 * The only inbound propagation channel the DEV runtime reads. Anything else
 * (baggage, B3, custom headers) is ignored so a request cannot smuggle extra
 * context into a span.
 */
export interface TraceContextCarrier {
  traceparent?: string
  tracestate?: string
}

export interface SpanOptions {
  kind?: SpanKind
  attributes?: SpanAttributes
  /** Continue an inbound W3C trace context (Hono request boundary only). */
  traceContext?: TraceContextCarrier
  /** Explicit start, epoch milliseconds. Used when a backend reports a
   *  completed operation together with its duration (SQLite diagnostics). */
  startTime?: number
}

export interface Span {
  readonly traceId: string
  readonly spanId: string
  setAttribute(key: string, value: SpanAttributeValue): void
  setAttributes(attributes: SpanAttributes): void
  setStatus(status: SpanStatus, message?: string): void
  recordError(error: unknown): void
  /** `endTime` is epoch milliseconds; omit for "now". */
  end(endTime?: number): void
}

export interface ActiveTraceIds {
  traceId: string
  spanId: string
  /** W3C trace flags; 1 means sampled. */
  traceFlags: number
  traceState?: string
}

export interface MetricOptions {
  description?: string
  unit?: string
}

export interface Counter {
  add(value: number, attributes?: MetricAttributes): void
}

export interface Histogram {
  record(value: number, attributes?: MetricAttributes): void
}

/**
 * The implementation contract. `runtime.ts` installs one; nothing else in the
 * application may implement or consume it.
 */
export interface TraceDelegate {
  startSpan(name: string, options?: SpanOptions): Span
  /** Run `fn` with `span` installed as the active OTel context. */
  runInSpan<T>(span: Span, fn: () => T): T
  activeTraceIds(): ActiveTraceIds | null
  counter?(name: string, options?: MetricOptions): Counter
  histogram?(name: string, options?: MetricOptions): Histogram
}

const noop = () => undefined

const NOOP_SPAN: Span = Object.freeze({
  traceId: '',
  spanId: '',
  setAttribute: noop,
  setAttributes: noop,
  setStatus: noop,
  recordError: noop,
  end: noop,
})

const NOOP_COUNTER: Counter = Object.freeze({ add: noop })
const NOOP_HISTOGRAM: Histogram = Object.freeze({ record: noop })

let activeDelegate: TraceDelegate | null = null

/**
 * Once-per-operation safe diagnostics: a broken delegate must not turn every
 * request into a log flood. The operation set is closed and tiny.
 */
const reportedFailures = new Set<string>()

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false
  }
  return typeof Reflect.get(value, 'then') === 'function'
}

function reportFailure(operation: string, error: unknown): void {
  try {
    if (reportedFailures.has(operation)) {
      return
    }
    reportedFailures.add(operation)
    log.warn('Trace telemetry failed; application execution continues', {
      operation,
      error: error instanceof Error ? error.name : typeof error,
    })
  } catch {
    // Diagnostics must never break the application path.
  }
}

function currentDelegate(): TraceDelegate | null {
  return activeDelegate
}

/**
 * Spans returned by `startSpan` keep their delegate object here so `runInSpan`
 * can install the ORIGINAL span as the active context while callers only ever
 * hold the guarded wrapper.
 */
const rawSpans = new WeakMap<Span, Span>()

function guardSpan(span: Span): Span {
  const safe = <T>(operation: string, fn: () => T): T | undefined => {
    try {
      return fn()
    } catch (error) {
      reportFailure(operation, error)
      return undefined
    }
  }
  let ended = false
  return {
    get traceId() {
      return safe('span.traceId', () => span.traceId) ?? ''
    },
    get spanId() {
      return safe('span.spanId', () => span.spanId) ?? ''
    },
    setAttribute(key, value) {
      safe('span.attribute', () => span.setAttribute(key, value))
    },
    setAttributes(attributes) {
      safe('span.attributes', () => span.setAttributes(attributes))
    },
    setStatus(status, message) {
      safe('span.status', () => span.setStatus(status, message))
    },
    recordError(error) {
      safe('span.error', () => span.recordError(error))
    },
    end(endTime) {
      if (ended) {
        return
      }
      ended = true
      safe('span.end', () => span.end(endTime))
    },
  }
}

function guardCounter(counter: Counter): Counter {
  return {
    add(value, attributes) {
      // The facade's last line of defence: a non-finite or negative counter
      // increment never reaches the SDK, whatever a caller passes.
      if (!Number.isFinite(value) || value < 0) {
        return
      }
      try {
        counter.add(value, attributes)
      } catch (error) {
        reportFailure('metric.add', error)
      }
    },
  }
}

function guardHistogram(histogram: Histogram): Histogram {
  return {
    record(value, attributes) {
      if (!Number.isFinite(value) || value < 0) {
        return
      }
      try {
        histogram.record(value, attributes)
      } catch (error) {
        reportFailure('metric.record', error)
      }
    },
  }
}

function callWithSpan<T>(span: Span, fn: (span: Span) => T): T {
  try {
    return fn(span)
  } catch (error) {
    span.recordError(error)
    span.setStatus('error')
    throw error
  } finally {
    span.end()
  }
}

async function callWithSpanAsync<T>(span: Span, fn: (span: Span) => Promise<T> | T): Promise<T> {
  try {
    return await fn(span)
  } catch (error) {
    span.recordError(error)
    span.setStatus('error')
    throw error
  } finally {
    span.end()
  }
}

interface SpanArguments<T> {
  options: SpanOptions | undefined
  fn: (span: Span) => T
}

type SpanOutcome<T> = { kind: 'pending' } | { kind: 'returned'; value: T } | { kind: 'threw'; error: unknown }

function splitSpanArguments<T>(
  optionsOrFn: SpanOptions | ((span: Span) => T),
  maybeFn: ((span: Span) => T) | undefined,
): SpanArguments<T> {
  if (typeof optionsOrFn === 'function') {
    return { options: undefined, fn: optionsOrFn }
  }
  if (maybeFn === undefined) {
    throw new TypeError('withSpan requires a callback')
  }
  return { options: optionsOrFn, fn: maybeFn }
}

function runWithSpan<T>(name: string, options: SpanOptions | undefined, fn: (span: Span) => T): T {
  const delegate = currentDelegate()
  if (delegate === null) {
    return fn(NOOP_SPAN)
  }

  let rawSpan: Span
  try {
    rawSpan = delegate.startSpan(name, options)
  } catch (error) {
    reportFailure('span.start', error)
    return fn(NOOP_SPAN)
  }
  const span = guardSpan(rawSpan)

  // Record the application outcome separately from delegate failures: a
  // delegate that throws during context cleanup must never replace a
  // successful result or the application's own error. The holder keeps the
  // union visible to TypeScript across the callback boundary.
  const execution: { outcome: SpanOutcome<T> } = { outcome: { kind: 'pending' } }
  let runThrew = false
  let runError: unknown
  try {
    // The delegate must see the ORIGINAL span object to install it as the
    // active OTel context; application code only ever receives the guarded
    // wrapper so a broken SDK object cannot throw into the request path.
    delegate.runInSpan(rawSpan, () => {
      try {
        const value = callWithSpan(span, fn)
        execution.outcome = { kind: 'returned', value }
        return value
      } catch (error) {
        execution.outcome = { kind: 'threw', error }
        throw error
      }
    })
  } catch (error) {
    runThrew = true
    runError = error
  }

  const outcome = execution.outcome
  if (outcome.kind === 'threw') {
    // A delegate may rethrow the application error verbatim — that is normal
    // propagation, not a telemetry failure. Only a different error is one.
    if (runThrew && runError !== outcome.error) {
      reportFailure('span.cleanup', runError)
    }
    throw outcome.error
  }

  if (outcome.kind === 'returned') {
    if (runThrew) {
      reportFailure('span.cleanup', runError)
    }
    return outcome.value
  }

  // The delegate failed before invoking the callback, or returned without
  // invoking it. `callWithSpan` never ran, so close the span here and degrade
  // to a single passthrough execution.
  reportFailure(runThrew ? 'span.run' : 'span.not-invoked', runThrew ? runError : new Error('not invoked'))
  span.end()
  return fn(NOOP_SPAN)
}

async function runWithSpanAsync<T>(
  name: string,
  options: SpanOptions | undefined,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const delegate = currentDelegate()
  if (delegate === null) {
    return fn(NOOP_SPAN)
  }

  let rawSpan: Span
  try {
    rawSpan = delegate.startSpan(name, options)
  } catch (error) {
    reportFailure('span.start', error)
    return fn(NOOP_SPAN)
  }
  const span = guardSpan(rawSpan)

  const execution: { outcome: SpanOutcome<T> } = { outcome: { kind: 'pending' } }
  let callbackPromise: Promise<T> | undefined
  let runThrew = false
  let runError: unknown
  try {
    await delegate.runInSpan(rawSpan, () => {
      callbackPromise = (async () => {
        try {
          const value = await callWithSpanAsync(span, fn)
          execution.outcome = { kind: 'returned', value }
          return value
        } catch (error) {
          execution.outcome = { kind: 'threw', error }
          throw error
        }
      })()
      return callbackPromise
    })
  } catch (error) {
    runThrew = true
    runError = error
  }

  // Defensive: a delegate that invokes the callback but does not await its
  // promise must not let the facade fall through to a second execution.
  if (callbackPromise !== undefined && execution.outcome.kind === 'pending') {
    try {
      await callbackPromise
    } catch {
      // The outcome below carries the application error.
    }
  }

  const outcome = execution.outcome
  if (outcome.kind === 'threw') {
    if (runThrew && runError !== outcome.error) {
      reportFailure('span.cleanup', runError)
    }
    throw outcome.error
  }

  if (outcome.kind === 'returned') {
    if (runThrew) {
      reportFailure('span.cleanup', runError)
    }
    return outcome.value
  }

  reportFailure(runThrew ? 'span.run' : 'span.not-invoked', runThrew ? runError : new Error('not invoked'))
  span.end()
  return fn(NOOP_SPAN)
}

export function withSpan<T>(name: string, fn: (span: Span) => T): T
export function withSpan<T>(name: string, options: SpanOptions, fn: (span: Span) => T): T
export function withSpan<T>(
  name: string,
  optionsOrFn: SpanOptions | ((span: Span) => T),
  maybeFn?: (span: Span) => T,
): T {
  const { options, fn } = splitSpanArguments(optionsOrFn, maybeFn)
  return runWithSpan(name, options, fn)
}

export function withSpanAsync<T>(name: string, fn: (span: Span) => Promise<T> | T): Promise<T>
export function withSpanAsync<T>(name: string, options: SpanOptions, fn: (span: Span) => Promise<T> | T): Promise<T>
export function withSpanAsync<T>(
  name: string,
  optionsOrFn: SpanOptions | ((span: Span) => Promise<T> | T),
  maybeFn?: (span: Span) => Promise<T> | T,
): Promise<T> {
  const { options, fn } = splitSpanArguments(optionsOrFn, maybeFn)
  return runWithSpanAsync(name, options, fn)
}

/**
 * Start a span whose lifetime the caller owns. Used where a single callback
 * cannot describe the boundary (SSR shell vs. stream). Inert builds, a missing
 * delegate, or a failing start degrades to a no-op span.
 */
export function startSpan(name: string, options?: SpanOptions): Span {
  const delegate = currentDelegate()
  if (delegate === null) {
    return NOOP_SPAN
  }
  try {
    const raw = delegate.startSpan(name, options)
    const guarded = guardSpan(raw)
    rawSpans.set(guarded, raw)
    return guarded
  } catch (error) {
    reportFailure('span.start', error)
    return NOOP_SPAN
  }
}

interface DelegateRunExecution {
  outcome: SpanOutcome<unknown>
  callbackPromise: Promise<unknown> | undefined
}

/**
 * Settle a manual `runInSpan` whose delegate returned a thenable. Mirrors the
 * `withSpanAsync` cleanup isolation (the caller owns the span, so nothing here
 * ends it), and passthrough-runs the application callback exactly once when
 * the delegate never invoked it.
 */
async function settleManualRunAsync(
  result: PromiseLike<unknown>,
  execution: DelegateRunExecution,
  fn: () => unknown,
): Promise<unknown> {
  let runThrew = false
  let runError: unknown
  try {
    await result
  } catch (error) {
    runThrew = true
    runError = error
  }

  // A delegate that returns a different promise may resolve before the
  // callback it invoked; wait for the callback's own promise so the outcome is
  // final (and cannot trigger a second execution).
  if (execution.callbackPromise !== undefined && execution.outcome.kind === 'pending') {
    try {
      await execution.callbackPromise
    } catch {
      // `outcome` carries the application error.
    }
  }

  const outcome = execution.outcome
  if (outcome.kind === 'threw') {
    if (runThrew && runError !== outcome.error) {
      reportFailure('span.cleanup', runError)
    }
    throw outcome.error
  }
  if (outcome.kind === 'returned') {
    if (runThrew) {
      reportFailure('span.cleanup', runError)
    }
    return outcome.value
  }

  reportFailure(runThrew ? 'span.run' : 'span.not-invoked', runThrew ? runError : new Error('not invoked'))
  return fn()
}

/**
 * Run `fn` with a manual span installed as the active OTel context, so nested
 * spans parent under it. Preserves the callback's result/throw exactly and
 * never replaces an application error with a telemetry failure — including a
 * delegate that rejects only after an async callback already settled.
 */
export function runInSpan<T>(span: Span, fn: () => T): T
export function runInSpan(span: Span, fn: () => unknown): unknown {
  const delegate = currentDelegate()
  const raw = rawSpans.get(span)
  if (delegate === null || raw === undefined) {
    return fn()
  }

  const execution: DelegateRunExecution = { outcome: { kind: 'pending' }, callbackPromise: undefined }

  const invoke = (): unknown => {
    try {
      const value = fn()
      if (isThenable(value)) {
        const promise = Promise.resolve(value)
        execution.callbackPromise = promise
        promise
          .then(
            (settled) => {
              execution.outcome = { kind: 'returned', value: settled }
            },
            (error) => {
              execution.outcome = { kind: 'threw', error }
            },
          )
          .catch(() => undefined)
        return promise
      }
      execution.outcome = { kind: 'returned', value }
      return value
    } catch (error) {
      execution.outcome = { kind: 'threw', error }
      throw error
    }
  }

  let result: unknown
  try {
    result = delegate.runInSpan(raw, invoke)
  } catch (error) {
    const outcome = execution.outcome
    if (outcome.kind === 'threw') {
      if (error !== outcome.error) {
        reportFailure('span.cleanup', error)
      }
      throw outcome.error
    }
    if (outcome.kind === 'returned') {
      reportFailure('span.cleanup', error)
      return outcome.value
    }
    if (execution.callbackPromise !== undefined) {
      // The delegate invoked an async callback and then failed during cleanup;
      // settle the application promise instead of running it a second time.
      reportFailure('span.cleanup', error)
      return settleManualRunAsync(execution.callbackPromise, execution, fn)
    }
    reportFailure('span.run', error)
    return fn()
  }

  if (isThenable(result)) {
    return settleManualRunAsync(result, execution, fn)
  }

  const outcome = execution.outcome
  if (outcome.kind === 'returned') {
    return outcome.value
  }
  if (outcome.kind === 'threw') {
    throw outcome.error
  }
  if (execution.callbackPromise !== undefined) {
    // A delegate that invoked an async callback must not lose its result just
    // because it returned something other than the callback's promise.
    return settleManualRunAsync(execution.callbackPromise, execution, fn)
  }
  reportFailure('span.not-invoked', new Error('not invoked'))
  return fn()
}

/** Active W3C ids for the current async context, or null when inert. */
export function activeTraceIds(): ActiveTraceIds | null {
  const delegate = currentDelegate()
  if (delegate === null) {
    return null
  }
  try {
    return delegate.activeTraceIds()
  } catch (error) {
    reportFailure('context.active', error)
    return null
  }
}

export function counter(name: string, options?: MetricOptions): Counter {
  const delegate = currentDelegate()
  if (delegate?.counter === undefined) {
    return NOOP_COUNTER
  }
  try {
    return guardCounter(delegate.counter(name, options))
  } catch (error) {
    reportFailure('metric.counter', error)
    return NOOP_COUNTER
  }
}

export function histogram(name: string, options?: MetricOptions): Histogram {
  const delegate = currentDelegate()
  if (delegate?.histogram === undefined) {
    return NOOP_HISTOGRAM
  }
  try {
    return guardHistogram(delegate.histogram(name, options))
  } catch (error) {
    reportFailure('metric.histogram', error)
    return NOOP_HISTOGRAM
  }
}

/** True only while a runtime delegate is installed. */
export function isTraceActive(): boolean {
  return currentDelegate() !== null
}

/**
 * Install the runtime delegate. Only `infra/trace/runtime.ts` calls this after
 * constructing a provider; a caller that misbehaves can at most route spans
 * into a broken delegate, which the guarded surface isolates.
 */
export function installTraceDelegate(delegate: TraceDelegate): boolean {
  if (activeDelegate === delegate) {
    return true
  }
  activeDelegate = delegate
  reportedFailures.clear()
  return true
}

/**
 * Restore the no-op facade. HMR disposal calls this with its own delegate
 * before shutting the provider down; a stale module instance therefore cannot
 * remove a newer one.
 */
export function uninstallTraceDelegate(delegate?: TraceDelegate): boolean {
  if (activeDelegate === null) {
    return false
  }
  if (delegate !== undefined && activeDelegate !== delegate) {
    return false
  }
  activeDelegate = null
  reportedFailures.clear()
  return true
}

export function isTraceDelegateInstalled(): boolean {
  return currentDelegate() !== null
}

/** Test-only: reset the module slot and its one-shot diagnostic memory. */
export function __resetTraceFacadeForTests(): void {
  activeDelegate = null
  reportedFailures.clear()
}
