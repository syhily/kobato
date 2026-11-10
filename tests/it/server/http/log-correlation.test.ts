import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace'

import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { Hono } from 'hono'
import { pinoLogger } from 'hono-pino'
import { requestId } from 'hono/request-id'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import type { Env } from '@/server/http/context'
import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

import { TestMetricReader } from '#/_helpers/in-memory-metric-reader'
import { root } from '@/server/infra/logger'
import { resBindings, sanitizeReqHeaders } from '@/server/infra/logger/sanitizer'
import { __resetLogSinkForTests } from '@/server/infra/logger/sink'
import { __resetTraceFacadeForTests } from '@/server/infra/trace/facade'
import { devTraceRequestMiddleware } from '@/server/infra/trace/middleware'
import { startTraceRuntime, stopTraceRuntime } from '@/server/infra/trace/runtime'

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const REMOTE_SPAN_ID = '00f067aa0ba902b7'
const TRACEPARENT = `00-${TRACE_ID}-${REMOTE_SPAN_ID}-01`

const SECRETS = {
  path: '/api/log-correlation',
  query: 'token=query-secret',
  requestId: 'request-fixture-secret',
  header: 'header-fixture-secret',
  authorization: 'Bearer auth-fixture-secret',
  cookie: 'session=cookie-fixture-secret',
  userAgent: 'agent-fixture-secret',
} as const

const CONFIG: ServerTraceRuntimeConfig = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
  otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
  logs: {
    otlpLogsUrl: 'http://127.0.0.1:5080/api/default/v1/logs',
    authorizationHeader: 'Basic dGVzdDp0ZXN0',
  },
}

function resolution(): TraceConfigResolution {
  return { status: 'active', server: CONFIG, frontend: null, diagnostics: [] }
}

/** Both in-memory exporters plus durable snapshots (their own shutdown clears the buffers). */
function createSpanHarness(): { exporter: SpanExporter; spans: ReadableSpan[] } {
  const inner = new InMemorySpanExporter()
  const spans: ReadableSpan[] = []
  return {
    spans,
    exporter: {
      export(batch, resultCallback) {
        spans.push(...batch)
        return inner.export(batch, resultCallback)
      },
      shutdown: () => inner.shutdown(),
      forceFlush: () => inner.forceFlush(),
    },
  }
}

function createLogHarness(): { exporter: LogRecordExporter; records: ReadableLogRecord[] } {
  const inner = new InMemoryLogRecordExporter()
  const records: ReadableLogRecord[] = []
  return {
    records,
    exporter: {
      export(batch, resultCallback) {
        records.push(...batch)
        return inner.export(batch, resultCallback)
      },
      shutdown: () => inner.shutdown(),
      forceFlush: () => inner.forceFlush(),
    },
  }
}

/** Production middleware order: requestId → trace span → hono-pino. */
function buildApp(): Hono<Env> {
  const app = new Hono<Env>()
  app.use(requestId())
  app.use(devTraceRequestMiddleware())
  app.use(
    pinoLogger({
      pino: root,
      http: {
        onReqBindings: (c) => ({
          requestId: c.var.requestId,
          req: {
            url: c.req.path,
            method: c.req.method,
            headers: sanitizeReqHeaders(c.req.header()),
          },
        }),
        onResBindings: resBindings,
      },
    }),
  )
  app.get(SECRETS.path, (c) => c.json({ ok: true }))
  return app
}

let spans: ReadableSpan[]
let records: ReadableLogRecord[]
let handle: Awaited<ReturnType<typeof startTraceRuntime>>
const originalRootLevel = root.level
let stdoutSpy: MockInstance<typeof process.stdout.write> | undefined

beforeEach(async () => {
  __resetTraceFacadeForTests()
  __resetLogSinkForTests()
  // The test env pins server.loggingLevel to silent; let the real Pino root write.
  root.level = 'debug'
  // The writable writes stdout first; keep the assertion run quiet without
  // changing what reaches the sink.
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as typeof process.stdout.write)

  const spanHarness = createSpanHarness()
  const logHarness = createLogHarness()
  spans = spanHarness.spans
  records = logHarness.records
  handle = await startTraceRuntime({
    resolution: resolution(),
    spanExporter: spanHarness.exporter,
    metricReader: new TestMetricReader(),
    logRecordExporter: logHarness.exporter,
  })
})

afterEach(async () => {
  await stopTraceRuntime()
  __resetTraceFacadeForTests()
  __resetLogSinkForTests()
  stdoutSpy?.mockRestore()
  stdoutSpy = undefined
  root.level = originalRootLevel
  vi.unstubAllEnvs()
})

describe('HTTP log correlation', () => {
  it('tags the response log with the http.server span ids and leaks no request facts', async () => {
    const app = buildApp()

    const response = await app.request(`${SECRETS.path}?${SECRETS.query}`, {
      headers: {
        traceparent: TRACEPARENT,
        'x-request-id': SECRETS.requestId,
        'x-fixture-header': SECRETS.header,
        authorization: SECRETS.authorization,
        cookie: SECRETS.cookie,
        'user-agent': SECRETS.userAgent,
      },
    })

    // The application result is unchanged by the telemetry pipeline.
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })

    await handle.forceFlush()

    const httpSpan = spans.find((span) => span.name === 'http.server')
    expect(httpSpan).toBeDefined()
    expect(httpSpan!.spanContext().traceId).toBe(TRACE_ID)
    expect(httpSpan!.parentSpanContext?.spanId).toBe(REMOTE_SPAN_ID)

    const responseLog = records.find((record) => record.body === 'HTTP request completed')
    expect(responseLog).toBeDefined()
    expect(responseLog!.severityNumber).toBe(9)
    expect(responseLog!.severityText).toBe('INFO')

    // Same trace/span as the request span: the log came from inside runInSpan.
    expect(responseLog!.spanContext?.traceId).toBe(httpSpan!.spanContext().traceId)
    expect(responseLog!.spanContext?.spanId).toBe(httpSpan!.spanContext().spanId)

    expect(responseLog!.attributes).toEqual({
      'log.scope': 'http',
      'http.request.method': 'GET',
      'http.response.status_code': 200,
    })

    const serialized = JSON.stringify({
      body: responseLog!.body,
      attributes: responseLog!.attributes,
      resource: responseLog!.resource.attributes,
      scope: responseLog!.instrumentationScope,
    })
    for (const forbidden of [
      SECRETS.path,
      SECRETS.query,
      SECRETS.requestId,
      SECRETS.header,
      'auth-fixture-secret',
      'cookie-fixture-secret',
      SECRETS.userAgent,
      TRACEPARENT,
      'Bearer',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }

    // Spans are equally free of query strings, headers, and the request id.
    const spanText = JSON.stringify(spans.map((span) => span.attributes))
    for (const forbidden of [SECRETS.query, SECRETS.requestId, SECRETS.header, 'auth-fixture-secret']) {
      expect(spanText).not.toContain(forbidden)
    }
  })

  it('keeps logging a 4xx response as a fixed rejected phrase', async () => {
    const app = buildApp()
    const response = await app.request('/api/does-not-exist?token=query-secret', {
      headers: { traceparent: TRACEPARENT },
    })
    expect(response.status).toBe(404)

    await handle.forceFlush()

    const rejected = records.find((record) => record.body === 'HTTP request rejected')
    expect(rejected).toBeDefined()
    expect(rejected!.attributes).toEqual({
      'log.scope': 'http',
      'http.request.method': 'GET',
      'http.response.status_code': 404,
    })
  })
})
