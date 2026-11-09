// Development-only OpenObserve OTel runtime (ADR-0012).
//
// This is the ONLY server module allowed to import the real OpenTelemetry
// SDKs. It is loaded through a DEV-only dynamic import from `server.ts`, so a
// production bundle has no provider, exporter, context manager, or sampler to
// reach. `facade.ts` stays the application-facing surface.
//
// Boundaries that matter here:
// - Resource attributes are a fixed three-key set for BOTH signals. No
//   host/OS/process/env detector runs (no `defaultResource()`).
// - Export is direct OTLP/HTTP into OpenObserve, behind a bounded queue and a
//   short export timeout. Nothing waits on an export in the request path.
// - Only W3C `traceparent`/`tracestate` are extracted; baggage and alternative
//   propagators are deliberately absent.
// - Metrics use a periodic reader with the same resource, a bounded export
//   timeout, and a closed instrument/attribute catalog (`metrics.ts`), so a
//   non-finite value or an undeclared label can never reach the exporter.

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
} from '@/server/infra/trace/facade'

import { registerShutdownHook, unregisterShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'
import { isTraceDevelopmentRuntime, loadTraceConfig } from '@/server/infra/trace/config'
import { installTraceDelegate, uninstallTraceDelegate } from '@/server/infra/trace/facade'
import { activateFrontendGate, deactivateFrontendGate } from '@/server/infra/trace/frontend-gate'
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
import { projectError, sanitizeSpanAttribute, sanitizeSpanAttributes } from '@/server/infra/trace/sanitize'
import { startSqliteQueryTrace, stopSqliteQueryTrace } from '@/server/infra/trace/sqlite'
import { APP_VERSION } from '@/shared/config/version'

const log = getLogger('trace')

const SERVICE_NAME = 'kobato'
const DEPLOYMENT_ENVIRONMENT = 'development'
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

export interface DevTraceHandle {
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

export interface DevTraceStartOptions {
  /** Test seam: skip boot-config resolution. */
  resolution?: TraceConfigResolution
  /** Test seam: in-memory exporter instead of direct OTLP/HTTP. */
  spanExporter?: SpanExporter
  /** Test seam: collect metrics in memory instead of the periodic OTLP reader. */
  metricReader?: MetricReader
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
  config: ServerTraceRuntimeConfig
  /** Isolated, idempotent cleanup actions shared by rollback and stop. */
  cleanup: () => void
  /** Token guard so an old runtime cannot clear a newer gate. */
  gateToken: object
  stopped: boolean
}

let runtime: RuntimeState | null = null

const INERT_HANDLE: DevTraceHandle = {
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

interface InstrumentCache {
  counter(name: string, options?: MetricOptions): Counter | null
  histogram(name: string, options?: MetricOptions): Histogram | null
}

function createInstrumentCache(meter: Meter | null): InstrumentCache {
  const counters = new Map<string, OtelCounter>()
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
  }
}

function buildExporter(config: ServerTraceRuntimeConfig): SpanExporter {
  return new OTLPTraceExporter({
    url: config.otlpTracesUrl,
    headers: { Authorization: config.authorizationHeader },
    timeoutMillis: EXPORT_TIMEOUT_MS,
    concurrencyLimit: 1,
  })
}

function buildResource() {
  return resourceFromAttributes({
    'service.name': SERVICE_NAME,
    'service.version': APP_VERSION,
    'deployment.environment': DEPLOYMENT_ENVIRONMENT,
  })
}

function buildProvider(config: ServerTraceRuntimeConfig, exporter: SpanExporter): TracerProvider {
  const resource = buildResource()
  const spanProcessor = new BatchSpanProcessor({
    exporter,
    maxQueueSize: MAX_QUEUE_SIZE,
    maxExportBatchSize: MAX_EXPORT_BATCH_SIZE,
    scheduledDelayMillis: SCHEDULED_DELAY_MS,
    exportTimeoutMillis: EXPORT_TIMEOUT_MS,
  })
  return new TracerProvider({
    resource,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.sampleRate) }),
    spanProcessors: [spanProcessor],
  })
}

/**
 * The single production metric exporter. DELTA temporality makes O2's
 * `_sum`/`_count` streams represent each export interval's increment, so a
 * dashboard `sum(value)` inside a short bucket is a true per-bucket total
 * rather than a re-summed cumulative snapshot. The selector keeps up-down
 * counters cumulative (the SDK's documented delta preference).
 *
 * Exported for the temporality contract test.
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
 * Build the meter pipeline: the same fixed resource, a periodic OTLP reader
 * (or a test reader), and the DEV-only event-loop observer. The observer is a
 * `perf_hooks` interval histogram — no host/process detector is involved.
 */
function buildMetricPipeline(
  config: ServerTraceRuntimeConfig,
  reader?: MetricReader,
  observerHooks?: MetricObserverHooks,
): MetricPipeline {
  const metricReader =
    reader ??
    new PeriodicExportingMetricReader({
      exporter: buildMetricExporter(config),
      exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
      exportTimeoutMillis: EXPORT_TIMEOUT_MS,
    })
  const provider = new MeterProvider({ resource: buildResource(), readers: [metricReader] })
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
 * Install the AsyncLocalStorage context manager. A prior DEV instance (HMR)
 * may already have registered one; the global slot then keeps that working
 * manager instead of replacing it, and no state is disabled on shutdown so a
 * reload cannot break the next instance.
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
  return Promise.all([traceFlush, metricFlush]).then(() => undefined)
}

function shutdownSignals(
  provider: TracerProvider,
  metricProvider: MeterProvider | null,
  timeoutMs: number,
): Promise<void> {
  const traceShutdown = provider.shutdown().catch(() => undefined)
  const metricShutdown =
    metricProvider === null
      ? Promise.resolve()
      : metricProvider.shutdown({ timeoutMillis: EXPORT_TIMEOUT_MS }).catch(() => undefined)
  return withTimeout(Promise.all([traceShutdown, metricShutdown]), timeoutMs)
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

function makeHandle(state: RuntimeState): DevTraceHandle {
  return {
    started: true,
    shutdown: () => stopDevTrace({ timeoutMs: SHUTDOWN_TIMEOUT_MS }),
    forceFlush: () => (state.stopped ? Promise.resolve() : withTimeout(flushAll(state), EXPORT_TIMEOUT_MS)),
  }
}

/**
 * Start the DEVELOPMENT trace pipeline. Idempotent: the same process returns
 * the same handle, and production/disabled/invalid configurations resolve to
 * an inert handle without constructing a provider.
 */
export async function startDevTrace(options: DevTraceStartOptions = {}): Promise<DevTraceHandle> {
  if (runtime !== null) {
    return makeHandle(runtime)
  }
  if (!isTraceDevelopmentRuntime()) {
    return INERT_HANDLE
  }

  const resolution = options.resolution ?? loadTraceConfig()
  if (resolution.status !== 'active' || resolution.server === null) {
    return INERT_HANDLE
  }

  const config = resolution.server
  let provider: TracerProvider
  try {
    const exporter = options.spanExporter ?? buildExporter(config)
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

  const gateToken: object = {}
  let verificationTimer: NodeJS.Timeout | null = null
  let metricPipeline: MetricPipeline | null = null
  let delegate: TraceDelegate | null = null
  let delegateInstalled = false
  let sqliteAttempted = false
  let shutdownHook: (() => Promise<void>) | null = null
  let rolledBack = false

  /**
   * Every cleanup action is independently isolated: a failure in one step must
   * not prevent the remaining resources from being released, and no cleanup
   * error may escape into HMR disposal or the process shutdown hook.
   */
  const cleanup = (): void => {
    const steps: Array<() => void> = [
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
      },
    ]
    for (const step of steps) {
      try {
        step()
      } catch {
        // Telemetry cleanup must never throw.
      }
    }
  }

  /**
   * Unified, idempotent rollback for everything after the tracer provider is
   * constructed. Cleanup actions share the isolated `cleanup` helper; provider
   * shutdown is bounded and never rejects.
   */
  const rollback = async (): Promise<void> => {
    if (rolledBack) {
      return
    }
    rolledBack = true
    cleanup()
    try {
      await shutdownSignals(provider, metricPipeline?.provider ?? null, SHUTDOWN_TIMEOUT_MS)
    } catch {
      // Telemetry cleanup must never throw.
    }
  }

  try {
    // A metric failure degrades to trace-only telemetry; it never disables the
    // trace pipeline (or the development site). This runs inside the unified
    // tail so even the degradation log cannot escape the rollback boundary.
    try {
      metricPipeline = buildMetricPipeline(config, options.metricReader, options.eventLoopObserver)
    } catch (error) {
      log.warn('OpenObserve metric pipeline could not start; metrics stay disabled', {
        error: error instanceof Error ? error.name : typeof error,
      })
    }

    ensureContextManager()

    const createdDelegate = createDelegate(provider, metricPipeline?.meter ?? null)
    delegate = createdDelegate
    delegateInstalled = installTraceDelegate(createdDelegate)
    if (!delegateInstalled) {
      await rollback()
      return INERT_HANDLE
    }

    sqliteAttempted = true
    startSqlite({ includeRedactedSql: config.includeRedactedSql })

    shutdownHook = () => stopDevTrace({ timeoutMs: SHUTDOWN_TIMEOUT_MS })
    registerHook(shutdownHook, SHUTDOWN_HOOK_PRIORITY)

    log.info('OpenObserve tracing enabled', {
      organization: config.organization,
      sampleRate: config.sampleRate,
      metrics: metricPipeline !== null,
    })

    runtime = {
      provider,
      metricProvider: metricPipeline?.provider ?? null,
      config,
      cleanup,
      gateToken,
      stopped: false,
    }

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
          activateFrontendGate(gateToken, resolution.frontend!)
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
export async function stopDevTrace(options: { timeoutMs?: number } = {}): Promise<void> {
  const state = runtime
  if (state === null) {
    return
  }
  runtime = null
  state.stopped = true

  try {
    state.cleanup()
  } catch {
    // Defensive: `cleanup` already isolates each step.
  }

  try {
    await shutdownSignals(state.provider, state.metricProvider, options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS)
  } catch {
    // Telemetry shutdown must never escape HMR disposal or a shutdown hook.
  }
}

/** Whether a provider + delegate are currently installed (tests, HMR audit). */
export function isDevTraceRunning(): boolean {
  return runtime !== null
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void stopDevTrace()
  })
}
