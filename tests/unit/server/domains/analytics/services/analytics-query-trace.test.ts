import type { ReadableSpan } from '@opentelemetry/sdk-trace'
import type { Compilable } from 'kysely'

import { SpanStatusCode } from '@opentelemetry/api'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsReader } from '@/server/domains/analytics/services/analytics-sql'
import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

import { TestMetricReader, dataPointsOf } from '#/_helpers/in-memory-metric-reader'
import { runAnalyticsQuery } from '@/server/domains/analytics/services/analytics-sql'
import { __resetTraceFacadeForTests, withSpanAsync } from '@/server/infra/trace/facade'
import { METRIC } from '@/server/infra/trace/metrics'
import { startDevTrace, stopDevTrace } from '@/server/infra/trace/runtime'

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
  return { status: 'active', server: CONFIG, frontend: null, diagnostics: [] }
}

const QUERY = {
  compile: () => ({ sql: 'SELECT secret_column FROM access_events WHERE blob1 = ?', parameters: ['secret-param'] }),
} as unknown as Compilable

function readerWith(run: () => Promise<{ getRowObjects: () => Record<string, unknown>[] }>): AnalyticsReader {
  return { runAndReadAll: vi.fn(run) } as unknown as AnalyticsReader
}

let exporter: InMemorySpanExporter
let spanSpy: ReadableSpan[]
let reader: TestMetricReader
let handle: Awaited<ReturnType<typeof startDevTrace>>

beforeEach(async () => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  exporter = new InMemorySpanExporter()
  spanSpy = []
  const harnessed = {
    export(batch: ReadableSpan[], cb: (result: { code: number }) => void) {
      spanSpy.push(...batch)
      return exporter.export(batch, cb as never)
    },
    shutdown: () => exporter.shutdown(),
    forceFlush: () => exporter.forceFlush(),
  }
  reader = new TestMetricReader()
  handle = await startDevTrace({ resolution: resolution(), spanExporter: harnessed, metricReader: reader })
})

afterEach(async () => {
  await stopDevTrace()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

describe('trace duckdb — analytics SQL boundary', () => {
  it('records a child span with only the stable operation, without SQL or parameters', async () => {
    const analyticsReader = readerWith(async () => ({ getRowObjects: () => [{ visits: 3n }] }))

    const rows = await withSpanAsync('request.parent', () => runAnalyticsQuery(analyticsReader, QUERY, 'views'))
    await handle.forceFlush()

    expect(rows).toEqual([{ visits: 3 }])
    const parent = spanSpy.find((span) => span.name === 'request.parent')
    const duck = spanSpy.find((span) => span.name === 'db.duckdb.query')
    expect(parent).toBeDefined()
    expect(duck).toBeDefined()
    expect(duck!.parentSpanContext?.spanId).toBe(parent!.spanContext().spanId)
    expect(duck!.attributes).toEqual({ 'db.engine': 'duckdb', 'db.operation': 'views' })
    expect(duck!.status.code).toBe(SpanStatusCode.OK)

    const serialized = JSON.stringify({
      attributes: duck!.attributes,
      events: duck!.events,
      status: duck!.status,
    })
    expect(serialized).not.toContain('SELECT')
    expect(serialized).not.toContain('access_events')
    expect(serialized).not.toContain('secret-param')
    expect(serialized).not.toContain('secret_column')
  })

  it('marks a failed execution as an error without exporting its message', async () => {
    const analyticsReader = readerWith(async () => {
      throw new Error('secret analytics failure at secret-param')
    })

    await expect(
      withSpanAsync('request.parent', () => runAnalyticsQuery(analyticsReader, QUERY, 'heatmap')),
    ).rejects.toThrow('secret analytics failure')
    await handle.forceFlush()

    const duck = spanSpy.find((span) => span.name === 'db.duckdb.query')
    expect(duck!.status.code).toBe(SpanStatusCode.ERROR)
    expect(duck!.attributes['error.type']).toBe('Error')
    expect(duck!.attributes['error.category']).toBe('unknown')
    expect(JSON.stringify(duck!.attributes)).not.toContain('secret analytics failure')
    expect(JSON.stringify(duck!.attributes)).not.toContain('secret-param')
  })

  it('records DB operation metrics with the engine, operation, and outcome', async () => {
    const ok = readerWith(async () => ({ getRowObjects: () => [] }))
    await withSpanAsync('request.parent', () => runAnalyticsQuery(ok, QUERY, 'metric_env'))
    const failing = readerWith(async () => {
      throw new Error('failed')
    })
    await expect(withSpanAsync('request.parent', () => runAnalyticsQuery(failing, QUERY, 'export'))).rejects.toThrow(
      'failed',
    )
    await handle.forceFlush()

    const metrics = await reader.collectResourceMetrics()
    const points = dataPointsOf(metrics, METRIC.dbOperationCount)
    const attributes = points.map((point) => point.attributes)
    expect(attributes).toContainEqual({
      'db.engine': 'duckdb',
      'db.operation': 'metric_env',
      'db.outcome': 'success',
    })
    expect(attributes).toContainEqual({
      'db.engine': 'duckdb',
      'db.operation': 'export',
      'db.outcome': 'error',
    })
    expect(dataPointsOf(metrics, METRIC.dbOperationDuration).length).toBeGreaterThan(0)
  })
})
