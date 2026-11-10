// OpenObserve OTel runtime: one of the two server modules allowed to import the
// OpenTelemetry SDKs (the other is `logs-runtime.ts`, which this constructs),
// reached through a dynamic import from `domains/observability/runtime-manager.ts`
// so the SDK chunk loads only when tracing is configured. `facade.ts` stays the
// application-facing surface.
//
// - Resource attributes come from the fixed three-key `resource.ts` for ALL
//   signals. No host/OS/process/env detector runs.
// - Export is direct OTLP/HTTP behind a bounded queue; nothing in the request
//   path waits on an export. Only W3C `traceparent`/`tracestate` are extracted.
// - Metrics use a periodic reader and the closed instrument/attribute catalog
//   (`metrics.ts`): a non-finite value or an undeclared label never exports.
// - Logs are a sibling pipeline projected by `log-record.ts`; a logs failure
//   degrades only logs.

import type {
  Context,
  Counter as OtelCounter,
  Histogram as OtelHistogram,
  Meter,
  ObservableGauge,
  Span as OtelSpan,
  SpanContext,
  TextMapGetter,
} from '@opentelemetry/api'
import type { LogRecordExporter } from '@opentelemetry/sdk-logs'
import type { MetricReader } from '@opentelemetry/sdk-metrics'
import type { SpanExporter } from '@opentelemetry/sdk-trace'

import { context, SpanKind as OtelSpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { AggregationTemporalityPreference, OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  TracerProvider,
} from '@opentelemetry/sdk-trace'
import { monitorEventLoopDelay, type ELDHistogram } from 'node:perf_hooks'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'
import type {
  ActiveTraceIds,
  Counter,
  Histogram,
  MetricOptions,
  Span,
  SpanKind,
  SpanOptions,
  TraceDelegate,
  UpDownCounter,
} from '@/server/infra/trace/facade'
import type { LogPipeline } from '@/server/infra/trace/logs-runtime'

import { registerShutdownHook, unregisterShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { clearLogSink, setLogSink } from '@/server/infra/logger/sink'
import { activateExportHealth, deactivateExportHealth, observeExporter } from '@/server/infra/trace/export-health'
import { installTraceDelegate, uninstallTraceDelegate } from '@/server/infra/trace/facade'
import { activateFrontendGate, deactivateFrontendGate } from '@/server/infra/trace/frontend-gate'
import { buildLogPipeline } from '@/server/infra/trace/logs-runtime'
import {
  isAllowedMetricName,
  METRIC,
  metricKind,
  sanitizeMetricAttributes,
  sanitizeMetricValue,
} from '@/server/infra/trace/metrics'
import {
  RUM_PRIVACY_VERIFY_TIMEOUT_MS,
  type FrontendPipelineVerifier,
  verifyRumPrivacyPipeline,
} from '@/server/infra/trace/pipeline-verify'
import { traceResourceAttributes } from '@/server/infra/trace/resource'
import { projectError, sanitizeSpanAttribute, sanitizeSpanAttributes } from '@/server/infra/trace/sanitize'
import { startSqliteQueryTrace, stopSqliteQueryTrace } from '@/server/infra/trace/sqlite'
import { APP_VERSION } from '@/shared/config/version'

const log = getLogger('trace')

const TRACER_NAME = 'kobato-server'
const TRACER_VERSION = APP_VERSION

// Bounded batch pipeline: a stalled OpenObserve instance drops telemetry
// instead of growing the heap or delaying shutdown.
const MAX_QUEUE_SIZE = 1024
const MAX_EXPORT_BATCH_SIZE = 256
const SCHEDULED_DELAY_MS = 1000
const EXPORT_TIMEOUT_MS = 3000
const METRIC_EXPORT_INTERVAL_MS = 10_000
const EVENT_LOOP_RESOLUTION_MS = 20
const SHUTDOWN_TIMEOUT_MS = 2000
const SHUTDOWN_HOOK_PRIORITY = 100
const FRONTEND_GATE_RECHECK_INTERVAL_MS = 15_000

const SPAN_KINDS: Readonly<Record<SpanKind, OtelSpanKind>> = {
  internal: OtelSpanKind.INTERNAL,
  server: OtelSpanKind.SERVER,
  client: OtelSpanKind.CLIENT,
  producer: OtelSpanKind.PRODUCER,
  consumer: OtelSpanKind.CONSUMER,
}

const TRACE_CONTEXT_GETTER: TextMapGetter<Record<string, string>> = {
  keys: (carrier) => Object.keys(carrier),
  get: (carrier, key) => carrier[key],
}

export interface TraceRuntimeHandle {
  /** True only when a real provider + delegate were installed. */
  readonly started: boolean
  /** Idempotent, bounded flush + shutdown. */
  shutdown(): Promise<void>
  /** Flush buffered spans (tests and diagnostics only). */
  forceFlush(): Promise<void>
}

/** Test seam for the event-loop observer (fault injection). */
export interface MetricObserverHooks {
  createMonitor?: () => ELDHistogram
  createGauge?: (meter: Meter) => ObservableGauge
}

/** Test seam for the startup tail side effects (fault injection). */
export interface TraceLifecycleHooks {
  startSqliteQueryTrace?: (options: { includeRedactedSql: boolean }) => void
  registerShutdownHook?: (hook: () => Promise<void>, priority: number) => void
  /** Test seams for stop/rollback fault injection; each is isolated by callers. */
  uninstallTraceDelegate?: (delegate: TraceDelegate) => void
  unregisterShutdownHook?: (hook: () => Promise<void>) => void
  stopSqliteQueryTrace?: () => void
  disableMonitor?: (monitor: ELDHistogram | null) => void
}

export interface TraceRuntimeStartOptions {
  /** The resolved settings projection; the domain orchestrator owns resolution. */
  resolution: TraceConfigResolution
  /** Test seam: in-memory exporter instead of direct OTLP/HTTP. */
  spanExporter?: SpanExporter
  /** Test seam: collect metrics in memory instead of the periodic OTLP reader. */
  metricReader?: MetricReader
  /** Test seam: in-memory exporter instead of direct OTLP/HTTP for the log pipeline. */
  logRecordExporter?: LogRecordExporter
  /** Test seam: replace the event-loop observer construction. */
  eventLoopObserver?: MetricObserverHooks
  /** Test seam: replace startup tail side effects. */
  lifecycle?: TraceLifecycleHooks
  /** Test seam: replace the OpenObserve privacy-pipeline verifier. */
  verifyFrontendPipeline?: FrontendPipelineVerifier
  /** Test seam: shorten the frontend gate verification timeout. */
  frontendVerifyTimeoutMs?: number
  /** Test seam: shorten the periodic gate re-verification interval. */
  frontendRecheckIntervalMs?: number
}

interface MetricPipeline {
  provider: MeterProvider
  meter: Meter
  monitor: ELDHistogram | null
}

interface RuntimeState {
  provider: TracerProvider
  metricProvider: MeterProvider | null
  logPipeline: LogPipeline | null
  config: ServerTraceRuntimeConfig
  /** Isolated, idempotent cleanup actions shared by rollback and stop. */
  cleanup: () => void
  /** Token guard so an old runtime cannot clear a newer gate. */
  gateToken: object
  stopped: boolean
}

let runtime: RuntimeState | null = null

const INERT_HANDLE: TraceRuntimeHandle = {
  started: false,
  shutdown: () => Promise.resolve(),
  forceFlush: () => Promise.resolve(),
}

const rawSpans = new WeakMap<Span, OtelSpan>()

/** Bound a promise without rejecting: shutdown must never block process exit. */
function withTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    timer.unref?.()
    promise.then(finish, finish).catch(() => undefined)
  })
}

function extractParentContext(propagator: W3CTraceContextPropagator, options?: SpanOptions): Context {
  const carrier: Record<string, string> = {}
  if (typeof options?.traceContext?.traceparent === 'string') {
    carrier.traceparent = options.traceContext.traceparent
  }
  if (typeof options?.traceContext?.tracestate === 'string') {
    carrier.tracestate = options.traceContext.tracestate
  }
  return propagator.extract(context.active(), carrier, TRACE_CONTEXT_GETTER)
}

function spanContextOf(span: OtelSpan): SpanContext {
  return span.spanContext()
}

function toActiveTraceIds(span: OtelSpan): ActiveTraceIds | null {
  const spanContext = spanContextOf(span)
  if (spanContext.traceId.length === 0 || spanContext.spanId.length === 0) {
    return null
  }
  const ids: ActiveTraceIds = {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  }
  const traceState = spanContext.traceState?.serialize()
  if (traceState !== undefined && traceState.length > 0) {
    ids.traceState = traceState
  }
  return ids
}

function readActiveTraceIds(): ActiveTraceIds | null {
  const span = trace.getSpan(context.active())
  return span === undefined ? null : toActiveTraceIds(span)
}

/** Wrap a real OTel span in the facade contract, applying the privacy allowlist. */
function createFacadeSpan(span: OtelSpan): Span {
  const facadeSpan: Span = {
    get traceId() {
      return spanContextOf(span).traceId
    },
    get spanId() {
      return spanContextOf(span).spanId
    },
    setAttribute(key, value) {
      const projected = sanitizeSpanAttribute(key, value)
      if (projected !== null) {
        span.setAttribute(projected[0], projected[1])
      }
    },
    setAttributes(attributes) {
      span.setAttributes(sanitizeSpanAttributes(attributes))
    },
    setStatus(status) {
      // The message argument is intentionally dropped: it may carry user/
      // request content, and a status code is all a trace needs.
      span.setStatus({ code: status === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK })
    },
    recordError(error) {
      const projection = projectError(error)
      span.setAttribute('error.type', projection.type)
      span.setAttribute('error.category', projection.category)
    },
    end(endTime) {
      if (endTime === undefined) {
        span.end()
      } else {
        span.end(endTime)
      }
    },
  }
  rawSpans.set(facadeSpan, span)
  return facadeSpan
}

const NOOP_COUNTER: Counter = Object.freeze({ add: () => undefined })
const NOOP_HISTOGRAM: Histogram = Object.freeze({ record: () => undefined })
const NOOP_UPDOWN_COUNTER: UpDownCounter = Object.freeze({ add: () => undefined })

interface InstrumentCache {
  counter(name: string, options?: MetricOptions): Counter | null
  histogram(name: string, options?: MetricOptions): Histogram | null
  upDownCounter(name: string, options?: MetricOptions): UpDownCounter | null
}

function createInstrumentCache(meter: Meter | null): InstrumentCache {
  const counters = new Map<string, OtelCounter>()
  const upDownCounters = new Map<string, OtelCounter>()
  const histograms = new Map<string, OtelHistogram>()

  return {
    counter(name, options) {
      if (meter === null || metricKind(name) !== 'counter') {
        return null
      }
      let instrument = counters.get(name)
      if (instrument === undefined) {
        try {
          instrument = meter.createCounter(name, { description: options?.description, unit: options?.unit })
          counters.set(name, instrument)
        } catch (error) {
          log.warn('Trace metric instrument could not be created', {
            metric: isAllowedMetricName(name) ? name : 'unknown',
            error: error instanceof Error ? error.name : typeof error,
          })
          return null
        }
      }
      return {
        add(value, attributes) {
          const sanitizedValue = sanitizeMetricValue(value)
          const projected = sanitizeMetricAttributes(name, attributes)
          if (sanitizedValue === null || projected === null) {
            return
          }
          instrument.add(sanitizedValue, projected)
        },
      }
    },
    histogram(name, options) {
      if (meter === null || metricKind(name) !== 'histogram') {
        return null
      }
      let instrument = histograms.get(name)
      if (instrument === undefined) {
        try {
          instrument = meter.createHistogram(name, { description: options?.description, unit: options?.unit })
          histograms.set(name, instrument)
        } catch (error) {
          log.warn('Trace metric instrument could not be created', {
            metric: isAllowedMetricName(name) ? name : 'unknown',
            error: error instanceof Error ? error.name : typeof error,
          })
          return null
        }
      }
      return {
        record(value, attributes) {
          const sanitizedValue = sanitizeMetricValue(value)
          const projected = sanitizeMetricAttributes(name, attributes)
          if (sanitizedValue === null || projected === null) {
            return
          }
          instrument.record(sanitizedValue, projected)
        },
      }
    },
    upDownCounter(name, options) {
      if (meter === null || metricKind(name) !== 'upDownCounter') {
        return null
      }
      let instrument = upDownCounters.get(name)
      if (instrument === undefined) {
        try {
          instrument = meter.createUpDownCounter(name, { description: options?.description, unit: options?.unit })
          upDownCounters.set(name, instrument)
        } catch (error) {
          log.warn('Trace metric instrument could not be created', {
            metric: isAllowedMetricName(name) ? name : 'unknown',
            error: error instanceof Error ? error.name : typeof error,
          })
          return null
        }
      }
      return {
        add(value, attributes) {
          // Signed deltas are the point: only a non-finite value is dropped.
          const projected = sanitizeMetricAttributes(name, attributes)
          if (!Number.isFinite(value) || projected === null) {
            return
          }
          instrument.add(value, projected)
        },
      }
    },
  }
}

function createDelegate(provider: TracerProvider, meter: Meter | null): TraceDelegate {
  const tracer = provider.getTracer(TRACER_NAME, TRACER_VERSION)
  const propagator = new W3CTraceContextPropagator()
  const instruments = createInstrumentCache(meter)

  return {
    startSpan(name, options) {
      const span = tracer.startSpan(
        name,
        {
          kind: SPAN_KINDS[options?.kind ?? 'internal'],
          attributes: sanitizeSpanAttributes(options?.attributes),
          startTime: options?.startTime,
        },
        extractParentContext(propagator, options),
      )
      return createFacadeSpan(span)
    },
    runInSpan(span, fn) {
      const raw = rawSpans.get(span)
      if (raw === undefined) {
        return fn()
      }
      return context.with(trace.setSpan(context.active(), raw), fn)
    },
    activeTraceIds() {
      return readActiveTraceIds()
    },
    counter(name, options) {
      return instruments.counter(name, options) ?? NOOP_COUNTER
    },
    histogram(name, options) {
      return instruments.histogram(name, options) ?? NOOP_HISTOGRAM
    },
    upDownCounter(name, options) {
      return instruments.upDownCounter(name, options) ?? NOOP_UPDOWN_COUNTER
    },
  }
}

// No rate-limiting on export-failure noise: the SDK logs one stderr line per
// failed flush, which only happens while OpenObserve is unreachable — that
// stream is the outage signal. The bounded queue drops spans during a prolonged
// outage instead of growing memory without bound.
function buildExporter(config: ServerTraceRuntimeConfig): SpanExporter {
  return new OTLPTraceExporter({
    url: config.otlpTracesUrl,
    headers: { Authorization: config.authorizationHeader },
    timeoutMillis: EXPORT_TIMEOUT_MS,
    concurrencyLimit: 1,
  })
}

function buildProvider(config: ServerTraceRuntimeConfig, exporter: SpanExporter): TracerProvider {
  const resource = resourceFromAttributes(traceResourceAttributes())
  const spanProcessor = new BatchSpanProcessor({
    exporter,
    maxQueueSize: MAX_QUEUE_SIZE,
    maxExportBatchSize: MAX_EXPORT_BATCH_SIZE,
    scheduledDelayMillis: SCHEDULED_DELAY_MS,
    exportTimeoutMillis: EXPORT_TIMEOUT_MS,
  })
  return new TracerProvider({
    resource,
    // ParentBased on purpose: a RUM-sampled browser session propagates
    // traceparent with sampled=1, so every server span under that session is
    // recorded regardless of `sampleRate`. The effective rate for
    // browser-initiated requests is governed by frontend.sessionSampleRate;
    // `sampleRate` bounds only server-originated (parentless) traces.
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.sampleRate) }),
    spanProcessors: [spanProcessor],
  })
}

/**
 * The single production metric exporter. DELTA temporality makes OpenObserve's
 * `_sum`/`_count` streams per-interval increments, so a dashboard `sum(value)`
 * in a short bucket is a true per-bucket total; up-down counters stay
 * cumulative (the SDK's documented delta preference).
 */
export function buildMetricExporter(config: ServerTraceRuntimeConfig): OTLPMetricExporter {
  return new OTLPMetricExporter({
    url: config.otlpMetricsUrl,
    headers: { Authorization: config.authorizationHeader },
    timeoutMillis: EXPORT_TIMEOUT_MS,
    concurrencyLimit: 1,
    temporalityPreference: AggregationTemporalityPreference.DELTA,
  })
}

/**
 * The event-loop observer is a `perf_hooks` interval histogram — no
 * host/process detector is involved.
 */
function buildMetricPipeline(
  config: ServerTraceRuntimeConfig,
  healthToken: object,
  reader?: MetricReader,
  observerHooks?: MetricObserverHooks,
): MetricPipeline {
  const metricReader =
    reader ??
    new PeriodicExportingMetricReader({
      exporter: observeExporter(buildMetricExporter(config), healthToken, 'metrics'),
      exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
      exportTimeoutMillis: EXPORT_TIMEOUT_MS,
    })
  const provider = new MeterProvider({
    resource: resourceFromAttributes(traceResourceAttributes()),
    readers: [metricReader],
  })
  let meter: Meter
  try {
    meter = provider.getMeter(TRACER_NAME, TRACER_VERSION)
  } catch (error) {
    // A bound reader starts its periodic interval; never leave it running when
    // the pipeline cannot be completed.
    void provider.shutdown().catch(() => undefined)
    throw error
  }

  let monitor: ELDHistogram | null = null
  try {
    const histogram =
      observerHooks?.createMonitor !== undefined
        ? observerHooks.createMonitor()
        : monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS })
    // Register the live interval BEFORE enabling it or touching the meter: any
    // later failure (enable, gauge creation, callback registration) must be
    // able to disable exactly the object this attempt created.
    monitor = histogram
    histogram.enable()
    const gauge =
      observerHooks?.createGauge !== undefined
        ? observerHooks.createGauge(meter)
        : meter.createObservableGauge(METRIC.eventLoopDelay, {
            description: 'Event loop delay mean',
            unit: 'ms',
          })
    gauge.addCallback((result) => {
      const mean = histogram.mean
      if (Number.isFinite(mean) && mean >= 0) {
        result.observe(mean / 1e6)
      }
    })
  } catch (error) {
    try {
      monitor?.disable()
    } catch {
      // Observer cleanup must never mask the original failure.
    }
    monitor = null
    log.warn('Event-loop delay observer unavailable; other metrics stay enabled', {
      error: error instanceof Error ? error.name : typeof error,
    })
  }

  return { provider, meter, monitor }
}

/**
 * A prior HMR instance may already own the global slot; the re-registration
 * then fails benignly and the working manager is kept. It is never disabled on
 * shutdown so a reload cannot break the next instance.
 */
function ensureContextManager(): void {
  try {
    const manager = new AsyncLocalStorageContextManager()
    manager.enable()
    context.setGlobalContextManager(manager)
  } catch (error) {
    log.warn('Trace async context manager unavailable; span parentage may degrade', {
      error: error instanceof Error ? error.name : typeof error,
    })
  }
}

function flushAll(state: RuntimeState): Promise<void> {
  const traceFlush = state.provider.forceFlush({ timeoutMillis: EXPORT_TIMEOUT_MS }).catch(() => undefined)
  const metricFlush =
    state.metricProvider === null
      ? Promise.resolve()
      : state.metricProvider.forceFlush({ timeoutMillis: EXPORT_TIMEOUT_MS }).catch(() => undefined)
  const logFlush = state.logPipeline === null ? Promise.resolve() : state.logPipeline.forceFlush(EXPORT_TIMEOUT_MS)
  return Promise.all([traceFlush, metricFlush, logFlush]).then(() => undefined)
}

function shutdownSignals(
  provider: TracerProvider,
  metricProvider: MeterProvider | null,
  logPipeline: LogPipeline | null,
  timeoutMs: number,
): Promise<void> {
  const traceShutdown = provider.shutdown().catch(() => undefined)
  const metricShutdown =
    metricProvider === null
      ? Promise.resolve()
      : metricProvider.shutdown({ timeoutMillis: EXPORT_TIMEOUT_MS }).catch(() => undefined)
  const logShutdown = logPipeline === null ? Promise.resolve() : logPipeline.shutdown()
  return withTimeout(Promise.all([traceShutdown, metricShutdown, logShutdown]), timeoutMs)
}

async function verifyFrontendGate(
  config: ServerTraceRuntimeConfig,
  verifier: FrontendPipelineVerifier,
  timeoutMs: number,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
    timer.unref?.()
  })
  const verified = Promise.resolve()
    .then(() => verifier(config))
    .catch(() => false)
  try {
    return await Promise.race([verified, timedOut])
  } finally {
    clearTimeout(timer)
  }
}

function makeHandle(state: RuntimeState): TraceRuntimeHandle {
  return {
    started: true,
    shutdown: () => stopTraceRuntime({ timeoutMs: SHUTDOWN_TIMEOUT_MS }),
    forceFlush: () => (state.stopped ? Promise.resolve() : withTimeout(flushAll(state), EXPORT_TIMEOUT_MS)),
  }
}

/**
 * Idempotent: a started process returns the same handle; disabled/invalid
 * configurations resolve to an inert handle without constructing a provider.
 */
export async function startTraceRuntime(options: TraceRuntimeStartOptions): Promise<TraceRuntimeHandle> {
  if (runtime !== null) {
    return makeHandle(runtime)
  }

  const resolution = options.resolution
  if (resolution.status !== 'active' || resolution.server === null) {
    return INERT_HANDLE
  }

  const config = resolution.server
  const gateToken: object = {}
  let provider: TracerProvider
  try {
    const exporter = observeExporter(options.spanExporter ?? buildExporter(config), gateToken, 'traces')
    provider = buildProvider(config, exporter)
  } catch (error) {
    try {
      log.warn('OpenObserve trace provider could not start; tracing stays disabled', {
        error: error instanceof Error ? error.name : typeof error,
      })
    } catch {
      // The logger must not turn a telemetry failure into an application error.
    }
    return INERT_HANDLE
  }

  const startSqlite = options.lifecycle?.startSqliteQueryTrace ?? startSqliteQueryTrace
  const registerHook = options.lifecycle?.registerShutdownHook ?? registerShutdownHook
  const uninstallDelegate = options.lifecycle?.uninstallTraceDelegate ?? uninstallTraceDelegate
  const unregisterHook = options.lifecycle?.unregisterShutdownHook ?? unregisterShutdownHook
  const stopSqlite = options.lifecycle?.stopSqliteQueryTrace ?? stopSqliteQueryTrace
  const disableMonitor = options.lifecycle?.disableMonitor ?? ((monitor: ELDHistogram | null) => monitor?.disable())

  let verificationTimer: NodeJS.Timeout | null = null
  let metricPipeline: MetricPipeline | null = null
  let logPipeline: LogPipeline | null = null
  let delegate: TraceDelegate | null = null
  let delegateInstalled = false
  let sqliteAttempted = false
  let shutdownHook: (() => Promise<void>) | null = null
  let rolledBack = false

  /**
   * Each step is isolated: one failure must not block the rest, and no cleanup
   * error may escape HMR disposal or the process shutdown hook.
   */
  const cleanup = (): void => {
    const steps: Array<() => void> = [
      // Detach the log sink first: nothing new may enter the pipeline while the
      // provider below is being flushed and shut down.
      () => {
        if (logPipeline !== null) {
          clearLogSink(logPipeline.sink)
        }
      },
      () => {
        if (delegateInstalled && delegate !== null) {
          uninstallDelegate(delegate)
        }
      },
      () => {
        if (shutdownHook !== null) {
          unregisterHook(shutdownHook)
        }
      },
      () => disableMonitor(metricPipeline?.monitor ?? null),
      () => {
        if (sqliteAttempted) {
          stopSqlite()
        }
      },
      () => {
        if (verificationTimer !== null) {
          clearInterval(verificationTimer)
          verificationTimer = null
        }
        deactivateFrontendGate(gateToken)
        deactivateExportHealth(gateToken)
      },
    ]
    for (const step of steps) {
      try {
        step()
      } catch {}
    }
  }

  /**
   * Idempotent rollback for everything after the tracer provider is
   * constructed; provider shutdown is bounded and never rejects.
   */
  const rollback = async (): Promise<void> => {
    if (rolledBack) {
      return
    }
    rolledBack = true
    cleanup()
    try {
      await shutdownSignals(provider, metricPipeline?.provider ?? null, logPipeline, SHUTDOWN_TIMEOUT_MS)
    } catch {}
  }

  try {
    // A metric failure degrades to trace-only telemetry; it never disables the
    // trace pipeline (or the site).
    try {
      metricPipeline = buildMetricPipeline(config, gateToken, options.metricReader, options.eventLoopObserver)
    } catch (error) {
      log.warn('OpenObserve metric pipeline could not start; metrics stay disabled', {
        error: error instanceof Error ? error.name : typeof error,
      })
    }

    ensureContextManager()

    // Logs are a sibling pipeline: a construction failure degrades only logs,
    // never traces or metrics.
    if (config.logs !== null) {
      try {
        logPipeline = buildLogPipeline(config.logs, { exporter: options.logRecordExporter, healthToken: gateToken })
      } catch (error) {
        logPipeline = null
        log.warn('OpenObserve log pipeline could not start; logs stay disabled', {
          error: error instanceof Error ? error.name : typeof error,
        })
      }
    }

    const createdDelegate = createDelegate(provider, metricPipeline?.meter ?? null)
    delegate = createdDelegate
    delegateInstalled = installTraceDelegate(createdDelegate)
    if (!delegateInstalled) {
      await rollback()
      return INERT_HANDLE
    }

    // The sink slot is process-wide: when it is already taken (an older
    // runtime left over from HMR), discard only this new log pipeline and keep
    // tracing.
    if (logPipeline !== null) {
      let installed = false
      try {
        installed = setLogSink(logPipeline.sink)
      } catch {
        installed = false
      }
      if (!installed) {
        const discarded = logPipeline
        logPipeline = null
        try {
          log.warn('OpenObserve log sink slot is unavailable; logs stay disabled')
        } catch {
          // A diagnostics failure must not affect tracing.
        }
        await withTimeout(discarded.shutdown(), EXPORT_TIMEOUT_MS)
      }
    }

    sqliteAttempted = true
    startSqlite({ includeRedactedSql: config.includeRedactedSql })

    shutdownHook = () => stopTraceRuntime({ timeoutMs: SHUTDOWN_TIMEOUT_MS })
    registerHook(shutdownHook, SHUTDOWN_HOOK_PRIORITY)

    log.info('OpenObserve tracing enabled', {
      organization: config.organization,
      sampleRate: config.sampleRate,
      metrics: metricPipeline !== null,
      logs: logPipeline !== null,
    })

    runtime = {
      provider,
      metricProvider: metricPipeline?.provider ?? null,
      logPipeline,
      config,
      cleanup,
      gateToken,
      stopped: false,
    }
    // Export health starts clean for the new runtime; failures land here via
    // the observed exporters from this point on.
    activateExportHealth(gateToken)

    // Whenever the settings projection produced a frontend CANDIDATE, verify
    // the O2 allowlist pipeline before exposing it. A failed/offline probe
    // withholds only browser RUM; the server pipeline keeps running.
    if (resolution.frontend !== null) {
      const verifier = options.verifyFrontendPipeline ?? verifyRumPrivacyPipeline
      const verifyTimeoutMs = options.frontendVerifyTimeoutMs ?? RUM_PRIVACY_VERIFY_TIMEOUT_MS
      let gateActive = false
      const verify = async (): Promise<boolean> => {
        const verified = await verifyFrontendGate(config, verifier, verifyTimeoutMs)
        if (runtime?.gateToken !== gateToken) {
          return verified
        }
        if (verified) {
          activateFrontendGate(gateToken, resolution.frontend!, resolution.frontendRelay!)
          if (!gateActive) {
            log.info('OpenObserve frontend RUM enabled after privacy pipeline verification', {
              organization: config.organization,
            })
          }
          gateActive = true
        } else {
          deactivateFrontendGate(gateToken)
          if (gateActive) {
            log.warn('OpenObserve frontend RUM withheld: privacy pipeline verification failed', {
              organization: config.organization,
            })
          }
          gateActive = false
        }
        return verified
      }

      await verify()
      const recheckMs = options.frontendRecheckIntervalMs ?? FRONTEND_GATE_RECHECK_INTERVAL_MS
      if (recheckMs > 0 && runtime?.gateToken === gateToken) {
        let recheckInFlight = false
        verificationTimer = setInterval(() => {
          if (recheckInFlight) {
            return
          }
          recheckInFlight = true
          void verify().finally(() => {
            recheckInFlight = false
          })
        }, recheckMs)
        verificationTimer.unref?.()
      }
    }

    return makeHandle(runtime)
  } catch (error) {
    // A logger/telemetry failure after the slot assignment must not leave a
    // live runtime handle behind.
    if (runtime?.provider === provider) {
      runtime = null
    }
    try {
      log.warn('OpenObserve tracing start failed; rolling back to the no-op facade', {
        error: error instanceof Error ? error.name : typeof error,
      })
    } catch {
      // The logger must not turn a telemetry failure into an application error.
    }
    await rollback()
    return INERT_HANDLE
  }
}

/** Idempotent, bounded teardown. Safe to call from HMR disposal and shutdown hooks. */
export async function stopTraceRuntime(options: { timeoutMs?: number } = {}): Promise<void> {
  const state = runtime
  if (state === null) {
    return
  }
  runtime = null
  state.stopped = true

  try {
    state.cleanup()
  } catch {}

  try {
    await shutdownSignals(
      state.provider,
      state.metricProvider,
      state.logPipeline,
      options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS,
    )
  } catch {
    // Telemetry shutdown must never escape HMR disposal or a shutdown hook.
  }
}

/** Whether a provider + delegate are currently installed (tests, HMR audit). */
export function isTraceRuntimeRunning(): boolean {
  return runtime !== null
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void stopTraceRuntime()
  })
}
