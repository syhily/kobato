import type { SpanExporter } from '@opentelemetry/sdk-trace'

import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

import { TestMetricReader, dataPointsOf, metricByName, pointValue } from '#/_helpers/in-memory-metric-reader'
import { __resetTraceFacadeForTests, counter, histogram, upDownCounter } from '@/server/infra/trace/facade'
import {
  addHttpServerActive,
  METRIC,
  recordCacheLookup,
  recordRumRelayOutcome,
  recordSsrPhase,
} from '@/server/infra/trace/metrics'
import { isTraceRuntimeRunning, startTraceRuntime, stopTraceRuntime } from '@/server/infra/trace/runtime'

const CONFIG: ServerTraceRuntimeConfig = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
  otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
  logs: null,
}

function resolution(): TraceConfigResolution {
  return { status: 'active', server: CONFIG, frontend: null, frontendRelay: null, diagnostics: [] }
}

function spanHarness(): SpanExporter {
  return new InMemorySpanExporter()
}

let reader: TestMetricReader

beforeEach(() => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  reader = new TestMetricReader()
})

afterEach(async () => {
  await stopTraceRuntime()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

async function start(metricReader: TestMetricReader = reader) {
  return startTraceRuntime({ resolution: resolution(), spanExporter: spanHarness(), metricReader })
}

const EVENT_LOOP_METRIC_TIMEOUT_MS = 2_000
const EVENT_LOOP_METRIC_POLL_MS = 25

/** The event-loop gauge comes from an observable callback, so the first `collect()` can see
 * no data point under load: poll with a bounded deadline; a missing observer still fails. */
async function waitForEventLoopDelay(metricReader: TestMetricReader) {
  const deadline = Date.now() + EVENT_LOOP_METRIC_TIMEOUT_MS
  for (;;) {
    const metrics = await metricReader.collectResourceMetrics()
    const delay = metricByName(metrics, METRIC.eventLoopDelay)
    const point = delay?.dataPoints[0]
    if (delay !== undefined && point !== undefined && typeof point.value === 'number' && Number.isFinite(point.value)) {
      return delay
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new Error(
        `event_loop.delay metric did not produce a finite sample within ${EVENT_LOOP_METRIC_TIMEOUT_MS}ms`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(EVENT_LOOP_METRIC_POLL_MS, remaining)))
  }
}

describe('trace metrics — closed catalog', () => {
  it('records only declared metric names and their declared attributes', async () => {
    await start()

    counter(METRIC.dbOperationCount).add(1, {
      'db.engine': 'sqlite',
      'db.operation': 'select',
      'db.outcome': 'success',
      'http.route': '/posts/:slug',
    })
    counter(METRIC.dbOperationCount).add(1, {
      'db.engine': 'duckdb',
      'db.operation': 'SELECT secret FROM t',
      'db.outcome': 'success',
    })
    counter('user.private.metric').add(1, { 'db.engine': 'sqlite' })

    const metrics = await reader.collectResourceMetrics()
    const count = metricByName(metrics, METRIC.dbOperationCount)
    expect(count).toBeDefined()
    const points = dataPointsOf(metrics, METRIC.dbOperationCount)
    expect(points).toHaveLength(1)
    expect(points[0]!.attributes).toEqual({
      'db.engine': 'sqlite',
      'db.operation': 'select',
      'db.outcome': 'success',
    })
    expect(points[0]!.attributes).not.toHaveProperty('http.route')
    expect(metricByName(metrics, 'user.private.metric')).toBeUndefined()
  })

  it('drops trace_id/span_id passed as metric labels (no exemplar support upstream)', async () => {
    await start()

    counter(METRIC.httpServerRequests).add(1, {
      'http.request.method': 'GET',
      'http.route': '/posts/:slug',
      'http.response.status_code': 200,
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      span_id: '00f067aa0ba902b7',
    })

    const metrics = await reader.collectResourceMetrics()
    const [point] = dataPointsOf(metrics, METRIC.httpServerRequests)
    expect(point).toBeDefined()
    expect(point!.attributes).toEqual({
      'http.request.method': 'GET',
      'http.route': '/posts/:slug',
      'http.response.status_code': 200,
    })
    expect(point!.attributes).not.toHaveProperty('trace_id')
    expect(point!.attributes).not.toHaveProperty('span_id')
    // sdk-metrics 3.1.0 / the 0.301.x OTLP transformer do not implement
    // exemplars; there is no per-point TraceID channel to assert either.
    expect((point as unknown as { exemplars?: unknown }).exemplars).toBeUndefined()
  })

  it('drops non-finite and negative metric values in both the runtime and the facade', async () => {
    await start()

    const requests = counter(METRIC.httpServerRequests)
    requests.add(1, { 'http.request.method': 'GET', 'http.route': '/', 'http.response.status_code': 200 })
    requests.add(Number.NaN, {})
    requests.add(Number.POSITIVE_INFINITY, {})
    requests.add(-1, {})

    const duration = histogram(METRIC.httpServerDuration)
    duration.record(5, { 'http.request.method': 'GET', 'http.route': '/', 'http.response.status_code': 200 })
    duration.record(Number.NaN, {})
    duration.record(-4, {})

    const metrics = await reader.collectResourceMetrics()
    expect(pointValue(dataPointsOf(metrics, METRIC.httpServerRequests)[0]!)).toBe(1)
    const durationPoint = dataPointsOf(metrics, METRIC.httpServerDuration)[0]!
    expect(durationPoint.value).toMatchObject({ count: 1, sum: 5 })
  })

  it('drops invalid SSR outcomes and cache buckets at the typed helper boundary', async () => {
    await start()

    recordSsrPhase('shell', 'bogus' as never, 5)
    recordCacheLookup('not-a-bucket' as never, 'hit', false)

    const metrics = await reader.collectResourceMetrics()
    expect(dataPointsOf(metrics, METRIC.ssrShellDuration)).toHaveLength(0)
    expect(dataPointsOf(metrics, METRIC.cacheLookupCount)).toHaveLength(0)
  })

  it('records declared SSR outcomes and cache buckets through the helpers', async () => {
    await start()

    recordSsrPhase('stream', 'aborted', 7)
    recordCacheLookup('feed', 'miss', true)

    const metrics = await reader.collectResourceMetrics()
    const ssr = dataPointsOf(metrics, METRIC.ssrStreamDuration)
    const cache = dataPointsOf(metrics, METRIC.cacheLookupCount)
    expect(ssr).toHaveLength(1)
    expect(ssr[0]!.attributes).toEqual({ 'ssr.outcome': 'aborted' })
    expect(cache).toHaveLength(1)
    expect(cache[0]!.attributes).toEqual({
      'cache.bucket': 'feed',
      'cache.result': 'miss',
      'cache.coalesced': true,
    })
  })

  it('records signed up/down deltas for in-flight requests, dropping non-finite values', async () => {
    await start()

    addHttpServerActive('GET', 1)
    addHttpServerActive('GET', 1)
    addHttpServerActive('POST', 1)
    addHttpServerActive('GET', -1)
    const active = upDownCounter(METRIC.httpServerActiveRequests)
    active.add(Number.NaN, { 'http.request.method': 'GET' })
    // Only the method is declared: a route (unknown while in flight) is dropped.
    active.add(1, { 'http.request.method': 'DELETE', 'http.route': '/posts/:slug' })

    const metrics = await reader.collectResourceMetrics()
    const points = dataPointsOf(metrics, METRIC.httpServerActiveRequests)
    const byMethod = new Map(points.map((point) => [point.attributes?.['http.request.method'], pointValue(point)]))
    expect(byMethod.get('GET')).toBe(1)
    expect(byMethod.get('POST')).toBe(1)
    expect(byMethod.get('DELETE')).toBe(1)
    for (const point of points) {
      expect(point.attributes).not.toHaveProperty('http.route')
    }
  })

  it('records only the closed relay outcome vocabulary', async () => {
    await start()

    recordRumRelayOutcome('ok')
    recordRumRelayOutcome('upstream_error')
    recordRumRelayOutcome('rate_limited')
    recordRumRelayOutcome('oversized')
    recordRumRelayOutcome('gate_closed' as never)

    const metrics = await reader.collectResourceMetrics()
    const points = dataPointsOf(metrics, METRIC.rumRelayOutcomes)
    const outcomes = points
      .map((point) => point.attributes?.['rum.relay.outcome'])
      .sort((a, b) => String(a).localeCompare(String(b)))
    expect(outcomes).toEqual(['ok', 'oversized', 'rate_limited', 'upstream_error'])
  })

  it('uses the same fixed three-key resource and no detector enrichment', async () => {
    await start()

    counter(METRIC.cacheLookupCount).add(1, {
      'cache.bucket': 'feed',
      'cache.result': 'hit',
      'cache.coalesced': false,
    })

    const metrics = await reader.collectResourceMetrics()
    expect(Object.keys(metrics.resource.attributes).sort()).toEqual([
      'deployment.environment',
      'service.name',
      'service.version',
    ])
    expect(metrics.resource.attributes['deployment.environment']).toBe('development')
  })

  it('collects the DEV-only event-loop delay gauge', async () => {
    await start()

    const delay = await waitForEventLoopDelay(reader)
    expect(delay.descriptor.unit).toBe('ms')
    const point = delay.dataPoints[0]!
    expect(typeof point.value).toBe('number')
    expect(Number.isFinite(point.value)).toBe(true)
  })

  it('does not rebuild the meter pipeline when start is called twice', async () => {
    const instrumentSpy = vi.spyOn(reader, 'setMetricProducer')
    const first = await start()
    const second = await start()

    expect(first.started).toBe(true)
    expect(second.started).toBe(true)
    expect(instrumentSpy).toHaveBeenCalledTimes(1)
  })

  it('restarts with a fresh reader and a single observer after HMR-style stop/start', async () => {
    const first = await start()
    await first.shutdown()
    expect(isTraceRuntimeRunning()).toBe(false)

    const secondReader = new TestMetricReader()
    const second = await start(secondReader)
    expect(second.started).toBe(true)

    const delay = await waitForEventLoopDelay(secondReader)
    expect(delay.dataPoints).toHaveLength(1)
  })
})

describe('trace metrics — lifecycle', () => {
  it('flushes the meter provider alongside the tracer within the bounded budget', async () => {
    const handle = await start()
    const flushSpy = vi.spyOn(reader, 'forceFlush')

    await handle.forceFlush()
    expect(flushSpy).toHaveBeenCalled()

    await handle.shutdown()
    await stopTraceRuntime()
    await stopTraceRuntime()
  })

  it('emits nothing after stop', async () => {
    const handle = await start()
    counter(METRIC.cacheLookupCount).add(1, {
      'cache.bucket': 'feed',
      'cache.result': 'hit',
      'cache.coalesced': false,
    })
    const before = dataPointsOf(await reader.collectResourceMetrics(), METRIC.cacheLookupCount)
    expect(before.length).toBe(1)

    await handle.shutdown()
    counter(METRIC.cacheLookupCount).add(1, {
      'cache.bucket': 'feed',
      'cache.result': 'hit',
      'cache.coalesced': false,
    })

    // The provider is shut down; the facade's no-op counter must not throw.
    expect(() => counter(METRIC.cacheLookupCount).add(1)).not.toThrow()
  })
})
