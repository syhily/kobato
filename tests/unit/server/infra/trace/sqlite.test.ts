import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace'

import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

import { TestMetricReader, dataPointsOf } from '#/_helpers/in-memory-metric-reader'
import { __resetTraceFacadeForTests, withSpanAsync } from '@/server/infra/trace/facade'
import { METRIC } from '@/server/infra/trace/metrics'
import { startTraceRuntime, stopTraceRuntime } from '@/server/infra/trace/runtime'
import {
  isSqliteQueryTraceSubscribed,
  sqlOperation,
  startSqliteQueryTrace,
  stopSqliteQueryTrace,
} from '@/server/infra/trace/sqlite'

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

interface SpanHarness {
  exporter: SpanExporter
  spans: ReadableSpan[]
}

function createExporterHarness(): SpanHarness {
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

let harness: SpanHarness
let reader: TestMetricReader
let handle: Awaited<ReturnType<typeof startTraceRuntime>>

beforeEach(async () => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  stopSqliteQueryTrace()
  harness = createExporterHarness()
  reader = new TestMetricReader()
  handle = await startTraceRuntime({
    resolution: resolution(),
    spanExporter: harness.exporter,
    metricReader: reader,
  })
})

afterEach(async () => {
  stopSqliteQueryTrace()
  await stopTraceRuntime()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

function runStatements(): void {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE t (a TEXT, b INTEGER)')
    db.prepare('INSERT INTO t VALUES (?, ?)').run('secret-value', 42)
    db.prepare('SELECT * FROM t WHERE a = ?').all('secret-value')
  } finally {
    db.close()
  }
}

describe('trace sqlite — operation vocabulary', () => {
  it('maps the first SQL keyword to a fixed operation and never echoes the statement', () => {
    expect(sqlOperation('  SELECT * FROM t')).toBe('select')
    expect(sqlOperation('insert into t values (1)')).toBe('insert')
    expect(sqlOperation('WITH x AS (SELECT 1) SELECT * FROM x')).toBe('with')
    expect(sqlOperation('EXPLAIN SELECT 1')).toBe('explain')
    expect(sqlOperation('ATTACH DATABASE secret AS s')).toBe('attach')
    expect(sqlOperation('DROP TABLE secret')).toBe('drop')
    expect(sqlOperation('a string that is not SQL')).toBe('other')
  })
})

describe('trace sqlite — subscriber', () => {
  it('never subscribes implicitly under vitest', async () => {
    expect(isSqliteQueryTraceSubscribed()).toBe(false)

    await withSpanAsync('request.parent', async () => {
      runStatements()
    })
    await handle.forceFlush()

    expect(harness.spans.filter((span) => span.name === 'db.sqlite.query')).toHaveLength(0)
  })

  it('creates a child span only while a request/job span is active', async () => {
    startSqliteQueryTrace({ enabledInTests: true })
    expect(isSqliteQueryTraceSubscribed()).toBe(true)

    await withSpanAsync('request.parent', async () => {
      runStatements()
    })
    await handle.forceFlush()

    const parent = harness.spans.find((span) => span.name === 'request.parent')
    const sqlite = harness.spans.filter((span) => span.name === 'db.sqlite.query')
    expect(parent).toBeDefined()
    expect(sqlite.length).toBeGreaterThanOrEqual(3)
    for (const span of sqlite) {
      expect(span.parentSpanContext?.spanId).toBe(parent!.spanContext().spanId)
      expect(span.spanContext().traceId).toBe(parent!.spanContext().traceId)
      expect(Object.keys(span.attributes).sort()).toEqual(['db.engine', 'db.operation'])
      expect(span.attributes['db.engine']).toBe('sqlite')
      expect(['create', 'insert', 'select']).toContain(span.attributes['db.operation'])
      expect(span.status.code).not.toBe(2)
    }

    const serialized = JSON.stringify(sqlite.map((span) => span.attributes))
    expect(serialized).not.toContain('secret-value')
    expect(serialized).not.toContain('db.statement')
  })

  it('drops statements executed without an active request/job context', async () => {
    startSqliteQueryTrace({ enabledInTests: true })

    runStatements()
    await handle.forceFlush()

    expect(harness.spans.filter((span) => span.name === 'db.sqlite.query')).toHaveLength(0)
  })

  it('emits db.statement only when includeRedactedSql is on, with literals replaced and bounded', async () => {
    stopSqliteQueryTrace()
    startSqliteQueryTrace({ enabledInTests: true, includeRedactedSql: true })

    await withSpanAsync('request.parent', async () => {
      const db = new DatabaseSync(':memory:')
      try {
        db.exec('CREATE TABLE t (a TEXT)')
        db.prepare('INSERT INTO t VALUES (?)').run('secret-value')
        db.prepare('SELECT * FROM t WHERE a = ?').all('secret-value')
      } finally {
        db.close()
      }
    })
    await handle.forceFlush()

    const statements = harness.spans
      .filter((span) => span.name === 'db.sqlite.query')
      .map((span) => span.attributes['db.statement'])
    expect(statements.length).toBeGreaterThanOrEqual(3)
    for (const statement of statements) {
      expect(typeof statement).toBe('string')
      expect((statement as string).length).toBeLessThanOrEqual(512)
      expect(statement).not.toContain('secret-value')
      expect(statement).not.toContain("'")
    }
    expect(statements.some((statement) => String(statement).includes('INSERT INTO t VALUES (?)'))).toBe(true)
  })

  it('records DB operation count/duration with engine, operation, and outcome', async () => {
    startSqliteQueryTrace({ enabledInTests: true })

    await withSpanAsync('request.parent', async () => {
      runStatements()
    })
    await handle.forceFlush()

    const metrics = await reader.collectResourceMetrics()
    const points = dataPointsOf(metrics, METRIC.dbOperationCount)
    expect(points.length).toBeGreaterThanOrEqual(3)
    for (const point of points) {
      expect(point.attributes['db.engine']).toBe('sqlite')
      expect(point.attributes['db.outcome']).toBe('success')
      expect(point.attributes['db.operation']).toEqual(expect.any(String))
      expect(Object.keys(point.attributes).sort()).toEqual(['db.engine', 'db.operation', 'db.outcome'])
    }
    expect(dataPointsOf(metrics, METRIC.dbOperationDuration).length).toBeGreaterThan(0)
  })

  it('stops publishing after stopSqliteQueryTrace', async () => {
    startSqliteQueryTrace({ enabledInTests: true })
    stopSqliteQueryTrace()
    expect(isSqliteQueryTraceSubscribed()).toBe(false)

    await withSpanAsync('request.parent', async () => {
      runStatements()
    })
    await handle.forceFlush()

    expect(harness.spans.filter((span) => span.name === 'db.sqlite.query')).toHaveLength(0)
  })
})
