import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs'

import { SeverityNumber } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ServerTraceRuntimeConfig,
  TraceConfigResolution,
  TraceLogsRuntimeConfig,
} from '@/server/infra/trace/config'

import { TestMetricReader } from '#/_helpers/in-memory-metric-reader'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'
import { __resetLogSinkForTests, pushLogLine } from '@/server/infra/logger/sink'
import {
  __resetTraceFacadeForTests,
  activeTraceIds,
  uninstallTraceDelegate,
  withSpanAsync,
} from '@/server/infra/trace/facade'
import { buildLogPipeline } from '@/server/infra/trace/logs-runtime'
import { isTraceRuntimeRunning, startTraceRuntime, stopTraceRuntime } from '@/server/infra/trace/runtime'
import { TRACE_LOG_STREAM } from '@/shared/contracts/trace-logs'

const exporterState = vi.hoisted(() => ({
  options: [] as Array<Record<string, unknown>>,
  throwOnConstruct: false,
}))

vi.mock('@opentelemetry/exporter-logs-otlp-http', () => ({
  OTLPLogExporter: class {
    constructor(options: Record<string, unknown>) {
      if (exporterState.throwOnConstruct) {
        throw new Error('log exporter construction failed')
      }
      exporterState.options.push(options)
    }
    export(): void {}
    shutdown(): Promise<void> {
      return Promise.resolve()
    }
    forceFlush(): Promise<void> {
      return Promise.resolve()
    }
  },
}))

const AUTHORIZATION = 'Basic dGVzdDp0ZXN0'

const LOGS_CONFIG: TraceLogsRuntimeConfig = {
  otlpLogsUrl: 'http://127.0.0.1:5080/api/default/v1/logs',
  authorizationHeader: AUTHORIZATION,
}

const SERVER_CONFIG: ServerTraceRuntimeConfig = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: AUTHORIZATION,
  sampleRate: 1,
  includeRedactedSql: false,
  otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
  otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
  logs: LOGS_CONFIG,
}

function resolution(overrides: Partial<ServerTraceRuntimeConfig> = {}): TraceConfigResolution {
  return { status: 'active', server: { ...SERVER_CONFIG, ...overrides }, frontend: null, diagnostics: [] }
}

/** In-memory exporter plus a durable snapshot: its own shutdown() clears the buffer. */
interface LogHarness {
  exporter: LogRecordExporter
  records: ReadableLogRecord[]
}

function createLogHarness(): LogHarness {
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

interface FlakyLogHarness {
  exporter: LogRecordExporter
  batches: ReadableLogRecord[][]
  delivered: ReadableLogRecord[]
}

/** First export callback reports FAILED, later exports succeed. */
function createFlakyLogHarness(): FlakyLogHarness {
  const inner = new InMemoryLogRecordExporter()
  const batches: ReadableLogRecord[][] = []
  const delivered: ReadableLogRecord[] = []
  let failNext = true
  return {
    batches,
    delivered,
    exporter: {
      export(batch, resultCallback) {
        batches.push([...batch])
        if (failNext) {
          failNext = false
          resultCallback({ code: ExportResultCode.FAILED, error: new Error('synthetic export rejection') })
          return
        }
        delivered.push(...batch)
        inner.export(batch, resultCallback)
      },
      shutdown: () => inner.shutdown(),
      forceFlush: () => inner.forceFlush(),
    },
  }
}

function line(record: Record<string, unknown> = {}): string {
  return JSON.stringify({
    level: 'info',
    time: '2026-01-01T00:00:00.000Z',
    msg: 'message',
    scope: 'app',
    ...record,
  })
}

let harness: LogHarness

beforeEach(() => {
  __resetTraceFacadeForTests()
  __resetLogSinkForTests()
  __clearLogCaptureForTests()
  exporterState.options.length = 0
  exporterState.throwOnConstruct = false
  harness = createLogHarness()
})

afterEach(async () => {
  await stopTraceRuntime()
  uninstallTraceDelegate()
  __resetTraceFacadeForTests()
  __resetLogSinkForTests()
  vi.unstubAllEnvs()
})

async function startWithLogs(overrides: Partial<ServerTraceRuntimeConfig> = {}) {
  return startTraceRuntime({
    resolution: resolution(overrides),
    spanExporter: new InMemorySpanExporter(),
    metricReader: new TestMetricReader(),
    logRecordExporter: harness.exporter,
  })
}

describe('log pipeline — projection boundary', () => {
  it('exports a projected record with the fixed three-key resource', async () => {
    const pipeline = buildLogPipeline(LOGS_CONFIG, { exporter: harness.exporter })

    pipeline.sink.push(line({ msg: 'plain message' }))
    await pipeline.forceFlush(1000)

    expect(harness.records).toHaveLength(1)
    const [record] = harness.records
    expect(record!.body).toBe('plain message')
    expect(record!.severityNumber).toBe(SeverityNumber.INFO)
    expect(record!.severityText).toBe('INFO')
    expect(record!.attributes).toEqual({ 'log.scope': 'app' })
    expect(record!.spanContext).toBeUndefined()
    expect(Object.keys(record!.resource.attributes).sort()).toEqual([
      'deployment.environment',
      'service.name',
      'service.version',
    ])
    expect(record!.resource.attributes['service.name']).toBe('kobato')
    expect(record!.resource.attributes['deployment.environment']).toBe('development')

    await pipeline.shutdown()
  })

  it('drops everything below info and marker/oversize lines instead of exporting them', async () => {
    const pipeline = buildLogPipeline(LOGS_CONFIG, { exporter: harness.exporter })

    pipeline.sink.push(line({ level: 'debug' }))
    pipeline.sink.push(line({ msg: 'user {E}alice{/E}' }))
    pipeline.sink.push(line({ msg: 'x'.repeat(64 * 1024) }))
    pipeline.sink.push('not json')
    await pipeline.forceFlush(1000)

    expect(harness.records).toEqual([])
    await pipeline.shutdown()
  })

  it('never exports forbidden fields, error content, or the authorization value', async () => {
    const pipeline = buildLogPipeline(LOGS_CONFIG, { exporter: harness.exporter })

    pipeline.sink.push(
      line({
        requestId: 'request-secret',
        responseTime: 987,
        req: { url: 'https://example.com/private?token=abc', headers: { authorization: AUTHORIZATION } },
        res: { status: 200, headers: { 'set-cookie': 'session=secret' } },
        context: { email: 'alice@example.com', ip: '203.0.113.9' },
        error: { name: 'TypeError', message: 'token=super-secret', stack: 'at secret.ts:1:1', cause: 'secret-cause' },
        msg: 'ignored for HTTP records',
      }),
    )
    await pipeline.forceFlush(1000)

    expect(harness.records).toHaveLength(1)
    const [record] = harness.records
    expect(Object.keys(record!.attributes).sort()).toEqual([
      'error.category',
      'error.type',
      'http.response.status_code',
      'log.scope',
    ])
    const serialized = JSON.stringify({
      body: record!.body,
      attributes: record!.attributes,
      resource: record!.resource.attributes,
    })
    for (const forbidden of [
      AUTHORIZATION,
      'request-secret',
      'example.com',
      'token=abc',
      'set-cookie',
      'alice@example.com',
      '203.0.113.9',
      'super-secret',
      'secret.ts',
      'secret-cause',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }

    await pipeline.shutdown()
  })

  it('isolates an exporter failure, never replays the dropped batch, and tries the next line independently', async () => {
    const flaky = createFlakyLogHarness()
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as typeof process.stdout.write)
    try {
      const pipeline = buildLogPipeline(LOGS_CONFIG, { exporter: flaky.exporter })

      expect(() => pipeline.sink.push(line({ msg: 'first' }))).not.toThrow()
      await pipeline.forceFlush(1000)
      expect(flaky.batches.flat().map((record) => record.body)).toEqual(['first'])
      expect(flaky.delivered).toEqual([])

      expect(() => pipeline.sink.push(line({ msg: 'second' }))).not.toThrow()
      await pipeline.forceFlush(1000)
      expect(flaky.delivered.map((record) => record.body)).toEqual(['second'])
      // The failed batch was dropped, not queued for replay.
      expect(flaky.batches.flat().map((record) => record.body)).toEqual(['first', 'second'])
      // The pipeline never writes a diagnostic line into the application's stdout logger.
      expect(stdoutSpy).not.toHaveBeenCalled()

      await pipeline.shutdown()
    } finally {
      stdoutSpy.mockRestore()
    }
  })

  it('shuts down idempotently and stops accepting lines afterwards', async () => {
    const pipeline = buildLogPipeline(LOGS_CONFIG, { exporter: harness.exporter })

    pipeline.sink.push(line())
    await pipeline.forceFlush(1000)
    expect(harness.records).toHaveLength(1)

    await pipeline.shutdown()
    await pipeline.shutdown()
    pipeline.sink.push(line({ msg: 'after shutdown' }))
    await pipeline.forceFlush(1000)

    expect(harness.records).toHaveLength(1)
  })
})

describe('log pipeline — exporter configuration', () => {
  it('posts to the OTLP logs URL with the server credential and stream name', async () => {
    const pipeline = buildLogPipeline(LOGS_CONFIG)

    expect(exporterState.options).toHaveLength(1)
    expect(exporterState.options[0]).toMatchObject({
      url: 'http://127.0.0.1:5080/api/default/v1/logs',
      headers: {
        Authorization: AUTHORIZATION,
        'stream-name': TRACE_LOG_STREAM,
      },
      timeoutMillis: 3000,
      concurrencyLimit: 1,
    })

    await pipeline.shutdown()
  })
})

describe('trace runtime — log pipeline lifecycle', () => {
  it('does not install a sink when trace.logs.enabled is off', async () => {
    const handle = await startWithLogs({ logs: null })
    expect(handle.started).toBe(true)

    pushLogLine(line())
    await handle.forceFlush()

    expect(harness.records).toEqual([])
    expect(exporterState.options).toEqual([])
  })

  it('installs the sink and includes logs in the handle flush', async () => {
    const handle = await startWithLogs()

    pushLogLine(line({ msg: 'through the runtime' }))
    await handle.forceFlush()

    expect(harness.records.map((record) => record.body)).toEqual(['through the runtime'])
    const enabled = __logCaptureForTests().filter((entry) => entry.msg === 'OpenObserve tracing enabled')
    expect(enabled.at(-1)?.ctx.logs).toBe(true)
  })

  it('installs the sink and exports in a production build', async () => {
    vi.stubEnv('DEV', false as never)
    vi.stubEnv('PROD', true as never)

    const handle = await startWithLogs()
    expect(handle.started).toBe(true)

    pushLogLine(line({ msg: 'production log' }))
    await handle.forceFlush()

    expect(harness.records.map((record) => record.body)).toEqual(['production log'])
    const enabled = __logCaptureForTests().filter((entry) => entry.msg === 'OpenObserve tracing enabled')
    expect(enabled.at(-1)?.ctx.logs).toBe(true)
  })

  it('correlates log records with the active span, across awaits', async () => {
    const handle = await startWithLogs()

    const ids: Array<{ traceId: string; spanId: string }> = []
    await withSpanAsync('log.parent', async (span) => {
      ids.push({ traceId: span.traceId, spanId: span.spanId })
      pushLogLine(line({ msg: 'inside' }))
      await Promise.resolve()
      pushLogLine(line({ msg: 'after await' }))
    })
    await handle.forceFlush()

    expect(ids).toHaveLength(1)
    expect(harness.records).toHaveLength(2)
    for (const record of harness.records) {
      expect(record.spanContext?.traceId).toBe(ids[0]!.traceId)
      expect(record.spanContext?.spanId).toBe(ids[0]!.spanId)
    }
  })

  it('keeps a valid trace id on log records from an unsampled trace', async () => {
    const handle = await startWithLogs({ sampleRate: 0 })

    let active: { traceId: string; spanId: string } | null = null
    await withSpanAsync('unsampled.parent', async () => {
      active = activeTraceIds()
      pushLogLine(line({ msg: 'unsampled' }))
    })
    await handle.forceFlush()

    expect(active).not.toBeNull()
    expect(harness.records).toHaveLength(1)
    expect(harness.records[0]!.spanContext?.traceId).toBe(active!.traceId)
    expect(harness.records[0]!.spanContext?.spanId).toBe(active!.spanId)
  })

  it('degrades only logs when the log pipeline cannot be constructed', async () => {
    exporterState.throwOnConstruct = true

    const handle = await startTraceRuntime({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: new TestMetricReader(),
    })

    expect(handle.started).toBe(true)
    expect(isTraceRuntimeRunning()).toBe(true)
    const warnings = __logCaptureForTests().filter((entry) => entry.msg.includes('log pipeline could not start'))
    expect(warnings).toHaveLength(1)

    pushLogLine(line())
    await handle.forceFlush()
    expect(harness.records).toEqual([])
  })

  it('uninstalls the sink on stop and stays idempotent', async () => {
    const handle = await startWithLogs()

    pushLogLine(line())
    await handle.shutdown()
    expect(isTraceRuntimeRunning()).toBe(false)

    pushLogLine(line({ msg: 'after stop' }))
    await handle.forceFlush()
    await handle.shutdown()
    await stopTraceRuntime()
    await stopTraceRuntime()

    expect(harness.records.map((record) => record.body)).toEqual(['message'])
  })
})
