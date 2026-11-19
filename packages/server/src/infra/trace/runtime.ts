import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@kobato/server/infra/trace/config.ts'
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
} from '@kobato/server/infra/trace/facade.ts'
import type { LogPipeline } from '@kobato/server/infra/trace/logs-runtime.ts'
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

import { APP_VERSION } from '@kobato/distribution/app.ts'
import { registerShutdownHook, unregisterShutdownHook } from '@kobato/server/infra/lifecycle.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { clearLogSink, setLogSink } from '@kobato/server/infra/logger/sink.ts'
import {
  activateExportHealth,
  deactivateExportHealth,
  observeExporter,
} from '@kobato/server/infra/trace/export-health.ts'
import { installTraceDelegate, uninstallTraceDelegate } from '@kobato/server/infra/trace/facade.ts'
import { activateFrontendGate, deactivateFrontendGate } from '@kobato/server/infra/trace/frontend-gate.ts'
import { buildLogPipeline } from '@kobato/server/infra/trace/logs-runtime.ts'
import {
  isAllowedMetricName,
  METRIC,
  metricKind,
  sanitizeMetricAttributes,
  sanitizeMetricValue,
} from '@kobato/server/infra/trace/metrics.ts'
import {
  RUM_PRIVACY_VERIFY_TIMEOUT_MS,
  type FrontendPipelineVerifier,
  verifyRumPrivacyPipeline,
} from '@kobato/server/infra/trace/pipeline-verify.ts'
import { traceResourceAttributes } from '@kobato/server/infra/trace/resource.ts'
import { projectError, sanitizeSpanAttribute, sanitizeSpanAttributes } from '@kobato/server/infra/trace/sanitize.ts'
import { startSqliteQueryTrace, stopSqliteQueryTrace } from '@kobato/server/infra/trace/sqlite.ts'
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

const log = getLogger('trace')

const TRACER_NAME = 'kobato-server'
const TRACER_VERSION = APP_VERSION

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
  readonly started: boolean
  shutdown(): Promise<void>
  forceFlush(): Promise<void>
}

export interface MetricObserverHooks {
  createMonitor?: () => ELDHistogram
  createGauge?: (meter: Meter) => ObservableGauge
}

export interface TraceLifecycleHooks {
  startSqliteQueryTrace?: (options: { includeRedactedSql: boolean }) => void
  registerShutdownHook?: (hook: () => Promise<void>, priority: number) => void
  uninstallTraceDelegate?: (delegate: TraceDelegate) => void
  unregisterShutdownHook?: (hook: () => Promise<void>) => void
  stopSqliteQueryTrace?: () => void
  disableMonitor?: (monitor: ELDHistogram | null) => void
}

export interface TraceRuntimeStartOptions {
  resolution: TraceConfigResolution
  spanExporter?: SpanExporter
  metricReader?: MetricReader
  logRecordExporter?: LogRecordExporter
  eventLoopObserver?: MetricObserverHooks
  lifecycle?: TraceLifecycleHooks
  verifyFrontendPipeline?: FrontendPipelineVerifier
  frontendVerifyTimeoutMs?: number
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
  cleanup: () => void
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
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.sampleRate) }),
    spanProcessors: [spanProcessor],
  })
}

export function buildMetricExporter(config: ServerTraceRuntimeConfig): OTLPMetricExporter {
  return new OTLPMetricExporter({
    url: config.otlpMetricsUrl,
    headers: { Authorization: config.authorizationHeader },
    timeoutMillis: EXPORT_TIMEOUT_MS,
    concurrencyLimit: 1,
    temporalityPreference: AggregationTemporalityPreference.DELTA,
  })
}

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
    void provider.shutdown().catch(() => undefined)
    throw error
  }

  let monitor: ELDHistogram | null = null
  try {
    const histogram =
      observerHooks?.createMonitor !== undefined
        ? observerHooks.createMonitor()
        : monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS })
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
    } catch {}
    monitor = null
    log.warn('Event-loop delay observer unavailable; other metrics stay enabled', {
      error: error instanceof Error ? error.name : typeof error,
    })
  }

  return { provider, meter, monitor }
}

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
    } catch {}
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

  const cleanup = (): void => {
    const steps: Array<() => void> = [
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
    try {
      metricPipeline = buildMetricPipeline(config, gateToken, options.metricReader, options.eventLoopObserver)
    } catch (error) {
      log.warn('OpenObserve metric pipeline could not start; metrics stay disabled', {
        error: error instanceof Error ? error.name : typeof error,
      })
    }

    ensureContextManager()

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
        } catch {}
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
    activateExportHealth(gateToken)

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
    if (runtime?.provider === provider) {
      runtime = null
    }
    try {
      log.warn('OpenObserve tracing start failed; rolling back to the no-op facade', {
        error: error instanceof Error ? error.name : typeof error,
      })
    } catch {}
    await rollback()
    return INERT_HANDLE
  }
}

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
  } catch {}
}

export function isTraceRuntimeRunning(): boolean {
  return runtime !== null
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void stopTraceRuntime()
  })
}
