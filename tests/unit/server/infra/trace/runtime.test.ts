import { SpanStatusCode } from '@opentelemetry/api'
import { InMemorySpanExporter, type ReadableSpan, type SpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

import { TestMetricReader } from '#/_helpers/in-memory-metric-reader'
import { __getLifecycleContainer } from '@/server/infra/lifecycle'
import {
  __resetTraceFacadeForTests,
  activeTraceIds,
  isTraceActive,
  runInSpan,
  startSpan,
  uninstallTraceDelegate,
  withSpanAsync,
} from '@/server/infra/trace/facade'
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

function activeResolution(overrides: Partial<ServerTraceRuntimeConfig> = {}): TraceConfigResolution {
  return {
    status: 'active',
    server: { ...CONFIG, ...overrides },
    frontend: null,
    diagnostics: [],
  }
}

function disabledResolution(): TraceConfigResolution {
  return { status: 'disabled', server: null, frontend: null, diagnostics: [] }
}

/**
 * Real OTel in-memory exporter plus a durable snapshot of what it received:
 * `InMemorySpanExporter.shutdown()` clears its own buffer, so a shutdown-flush
 * assertion needs the exported spans retained separately.
 */
interface ExporterHarness {
  exporter: SpanExporter
  spans: ReadableSpan[]
}

function createExporterHarness(): ExporterHarness {
  const inner = new InMemorySpanExporter()
  const spans: ReadableSpan[] = []
  const exporter: SpanExporter = {
    export(batch, resultCallback) {
      spans.push(...batch)
      return inner.export(batch, resultCallback)
    },
    shutdown: () => inner.shutdown(),
    forceFlush: () => inner.forceFlush(),
  }
  return { exporter, spans }
}

let harness: ExporterHarness

beforeEach(() => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  harness = createExporterHarness()
})

afterEach(async () => {
  await stopTraceRuntime()
  uninstallTraceDelegate()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

async function start(
  overrides: Partial<ServerTraceRuntimeConfig> = {},
): Promise<Awaited<ReturnType<typeof startTraceRuntime>>> {
  return startTraceRuntime({
    resolution: activeResolution(overrides),
    spanExporter: harness.exporter,
    // Keep forceFlush/shutdown off the real OTLP network in unit tests.
    metricReader: new TestMetricReader(),
  })
}

describe('trace runtime — activation gates', () => {
  it('starts a real provider for an active DEV configuration', async () => {
    const handle = await start()

    expect(handle.started).toBe(true)
    expect(isTraceRuntimeRunning()).toBe(true)
    expect(isTraceActive()).toBe(true)
  })

  it('does not start for disabled or invalid configuration', async () => {
    const disabled = await startTraceRuntime({ resolution: disabledResolution(), spanExporter: harness.exporter })
    expect(disabled.started).toBe(false)
    expect(isTraceActive()).toBe(false)

    const invalid = await startTraceRuntime({
      resolution: { status: 'invalid', server: null, frontend: null, diagnostics: [] },
      spanExporter: harness.exporter,
    })
    expect(invalid.started).toBe(false)
    expect(isTraceActive()).toBe(false)
  })

  it('starts in a production build when the settings resolution is active', async () => {
    vi.stubEnv('DEV', false as never)
    vi.stubEnv('PROD', true as never)

    const handle = await startTraceRuntime({ resolution: activeResolution(), spanExporter: harness.exporter })

    expect(handle.started).toBe(true)
    expect(isTraceRuntimeRunning()).toBe(true)
    expect(isTraceActive()).toBe(true)
  })

  it('is idempotent: a second start keeps one provider', async () => {
    const first = await start()
    const second = await start()

    expect(first.started).toBe(true)
    expect(second.started).toBe(true)

    await withSpanAsync('single.span', async () => 'ok')
    await second.forceFlush()

    expect(harness.spans).toHaveLength(1)
  })

  it('registers exactly one bounded shutdown hook and removes it on stop', async () => {
    const container = __getLifecycleContainer()
    const before = container.hooks.length

    const handle = await start()
    expect(container.hooks).toHaveLength(before + 1)

    await handle.shutdown()
    expect(container.hooks).toHaveLength(before)

    await stopTraceRuntime()
    expect(container.hooks).toHaveLength(before)
  })

  it('stops idempotently and emits nothing afterwards', async () => {
    const handle = await start()

    await withSpanAsync('before.stop', async () => 'ok')
    await handle.shutdown()
    await stopTraceRuntime()
    await stopTraceRuntime()

    expect(isTraceRuntimeRunning()).toBe(false)
    expect(isTraceActive()).toBe(false)

    await withSpanAsync('after.stop', async () => 'ok')
    await handle.forceFlush()

    expect(harness.spans.map((span) => span.name)).toEqual(['before.stop'])
  })
})

describe('trace runtime — real OTel spans', () => {
  it('records a span with the fixed, detector-free resource attributes', async () => {
    const handle = await start()

    await withSpanAsync('resource.span', async () => 'ok')
    await handle.forceFlush()

    const [span] = harness.spans
    expect(span).toBeDefined()
    expect(Object.keys(span!.resource.attributes).sort()).toEqual([
      'deployment.environment',
      'service.name',
      'service.version',
    ])
    expect(span!.resource.attributes['service.name']).toBe('kobato')
    expect(span!.resource.attributes['deployment.environment']).toBe('development')
  })

  it('keeps the AsyncLocalStorage active context across awaits and nests child spans', async () => {
    const handle = await start()
    const seen: Array<{ traceId: string; spanId: string }> = []

    await withSpanAsync('parent.span', async (parent) => {
      await Promise.resolve()
      const active = activeTraceIds()
      expect(active?.traceId).toBe(parent.traceId)
      seen.push({ traceId: parent.traceId, spanId: parent.spanId })
    })
    await handle.forceFlush()

    const [parent] = harness.spans
    expect(parent!.spanContext().traceId).toBe(seen[0]!.traceId)
    expect(parent!.spanContext().spanId).toBe(seen[0]!.spanId)
    expect(activeTraceIds()).toBeNull()
  })

  it('parents manual spans under the span installed by runInSpan', async () => {
    const handle = await start()

    const parent = startSpan('parent.manual', { kind: 'server' })
    runInSpan(parent, () => {
      const child = startSpan('child.manual')
      child.end()
    })
    parent.end()
    await handle.forceFlush()

    const spans = harness.spans
    const parentSpan = spans.find((span) => span.name === 'parent.manual')
    const childSpan = spans.find((span) => span.name === 'child.manual')
    expect(parentSpan).toBeDefined()
    expect(childSpan?.parentSpanContext?.spanId).toBe(parentSpan?.spanContext().spanId)
    expect(childSpan?.spanContext().traceId).toBe(parentSpan?.spanContext().traceId)
  })

  it('extracts W3C traceparent/tracestate as the span parent', async () => {
    const handle = await start()
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    const tracestate = 'kobato=test'

    await withSpanAsync('incoming.span', { traceContext: { traceparent, tracestate } }, async () => 'ok')
    await handle.forceFlush()

    const [span] = harness.spans
    expect(span!.spanContext().traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
    expect(span!.parentSpanContext?.spanId).toBe('00f067aa0ba902b7')
    expect(span!.spanContext().traceState?.serialize()).toBe(tracestate)
  })

  it('ignores non-W3C carriers and invalid traceparents', async () => {
    const handle = await start()

    await withSpanAsync(
      'no.propagation',
      {
        traceContext: {
          traceparent: '00-00000000000000000000000000000000-0000000000000000-01',
          tracestate: 'malformed',
        },
      },
      async () => 'ok',
    )
    await handle.forceFlush()

    const [span] = harness.spans
    expect(span!.spanContext().traceId).not.toBe('00000000000000000000000000000000')
    expect(span!.parentSpanContext).toBeUndefined()
  })

  it('drops every span when the root sampler is 0', async () => {
    const handle = await start({ sampleRate: 0 })

    await withSpanAsync('sampled.out', async () => 'ok')
    await handle.forceFlush()

    expect(harness.spans).toHaveLength(0)
  })
})

describe('trace runtime — privacy projection', () => {
  it('records only error type/category — no message, stack, or URL', async () => {
    const handle = await start()
    const error = new Error('secret message for http://localhost/private?token=abc')

    await expect(
      withSpanAsync('failing.span', async () => {
        throw error
      }),
    ).rejects.toBe(error)

    await handle.forceFlush()
    const [span] = harness.spans

    expect(span!.status.code).toBe(SpanStatusCode.ERROR)
    expect(span!.attributes['error.type']).toBe('Error')
    expect(span!.attributes['error.category']).toBe('unknown')

    const serialized = JSON.stringify({
      attributes: span!.attributes,
      events: span!.events,
      status: span!.status,
    })
    expect(serialized).not.toContain('secret message')
    expect(serialized).not.toContain('localhost')
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain(error.stack ?? 'at ')
  })

  it('drops arbitrary attribute keys and values passed by callers', async () => {
    const handle = await start()

    await withSpanAsync(
      'attributes.span',
      {
        attributes: {
          'http.route': '/posts/:slug',
          'http.url': 'http://localhost/posts/secret?token=abc',
          'user.email': 'person@example.com',
        },
      },
      async (span) => {
        span.setAttribute('http.request.method', 'GET')
        span.setAttribute('http.headers.cookie', 'session=secret')
      },
    )
    await handle.forceFlush()

    const [span] = harness.spans
    expect(span!.attributes).toEqual({
      'http.route': '/posts/:slug',
      'http.request.method': 'GET',
    })
  })
})
