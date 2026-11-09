import type { ReadableSpan } from '@opentelemetry/sdk-trace'

import { SpanStatusCode } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

vi.mock('@/server/infra/db/job-run-recorder', () => ({
  startJobRun: vi.fn(() => 42),
  finishJobRun: vi.fn(),
}))

import { TestMetricReader } from '#/_helpers/in-memory-metric-reader'
import { scheduleJob, stopAllScheduledJobs } from '@/server/infra/scheduler-utils'
import { __resetTraceFacadeForTests, withSpanAsync } from '@/server/infra/trace/facade'
import { startDevTrace, stopDevTrace } from '@/server/infra/trace/runtime'

const CONFIG: ServerTraceRuntimeConfig = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
  otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
}

function resolution(): TraceConfigResolution {
  return { status: 'active', server: CONFIG, frontend: null, diagnostics: [] }
}

let spans: ReadableSpan[]
let handle: Awaited<ReturnType<typeof startDevTrace>>

beforeEach(async () => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  spans = []
  // Synchronous export result: the SDK's InMemorySpanExporter defers the
  // callback through `setTimeout`, which would need advancing under fake timers.
  const harnessed = {
    export(batch: ReadableSpan[], cb: (result: { code: number }) => void) {
      spans.push(...batch)
      cb({ code: ExportResultCode.SUCCESS })
    },
    shutdown: () => Promise.resolve(),
    forceFlush: () => Promise.resolve(),
  }
  handle = await startDevTrace({
    resolution: resolution(),
    spanExporter: harnessed,
    metricReader: new TestMetricReader(),
  })
  vi.useFakeTimers()
})

afterEach(async () => {
  stopAllScheduledJobs()
  vi.useRealTimers()
  await stopDevTrace()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

describe('trace jobs — scheduler perimeter', () => {
  it('records job.run with the registered name and catalog task key, never payloads', async () => {
    scheduleJob({
      name: 'webmention-outbox',
      task: { key: 'webmention-outbox' },
      nextDelayMs: () => 10,
      run: async () => {
        await withSpanAsync('job.child', async () => 'ok')
      },
    })
    await vi.advanceTimersByTimeAsync(10)
    await handle.forceFlush()

    const job = spans.find((span) => span.name === 'job.run')
    const child = spans.find((span) => span.name === 'job.child')
    expect(job).toBeDefined()
    expect(job!.attributes).toEqual({
      'job.name': 'webmention-outbox',
      'job.task_key': 'webmention-outbox',
    })
    expect(job!.status.code).toBe(SpanStatusCode.OK)
    expect(child?.parentSpanContext?.spanId).toBe(job!.spanContext().spanId)
    expect(JSON.stringify(job!.attributes)).not.toContain('secret')
  })

  it('records an unbound job with only the registered name', async () => {
    scheduleJob({
      name: 'adhoc-sweep',
      nextDelayMs: () => 10,
      run: () => undefined,
    })
    await vi.advanceTimersByTimeAsync(10)
    await handle.forceFlush()

    const job = spans.find((span) => span.name === 'job.run')
    expect(job!.attributes).toEqual({ 'job.name': 'adhoc-sweep' })
  })

  it('marks a throwing run as an error without exporting its message', async () => {
    scheduleJob({
      name: 'backup',
      task: { key: 'backup', recordHistory: true },
      nextDelayMs: () => 10,
      run: async () => {
        throw new Error('secret backup failure')
      },
    })
    await vi.advanceTimersByTimeAsync(10)
    await handle.forceFlush()

    const job = spans.find((span) => span.name === 'job.run')
    expect(job!.status.code).toBe(SpanStatusCode.ERROR)
    expect(job!.attributes['error.type']).toBe('Error')
    expect(job!.attributes['error.category']).toBe('unknown')
    expect(JSON.stringify(job!.attributes)).not.toContain('secret backup failure')
  })
})
