import type { ReadableSpan } from '@opentelemetry/sdk-trace'
import type { Worker } from 'node:worker_threads'

import { SpanStatusCode } from '@opentelemetry/api'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: vi.fn(),
  unregisterShutdownHook: vi.fn(),
}))

import { TestMetricReader, dataPointsOf } from '#/_helpers/in-memory-metric-reader'
import { __resetTraceFacadeForTests, withSpanAsync } from '@/server/infra/trace/facade'
import { METRIC } from '@/server/infra/trace/metrics'
import { startTraceRuntime, stopTraceRuntime } from '@/server/infra/trace/runtime'

const { WorkerPool, __setWorkerFactory, __resetWorkerFactory } = await import('@/server/infra/image/process-pool')

class FakeWorker extends EventEmitter {
  posted: Array<{ id: number; type: string; input: unknown }> = []
  terminated = false
  postMessage(msg: { id: number; type: string; input: unknown }) {
    this.posted.push(msg)
  }
  async terminate() {
    this.terminated = true
    return 0
  }
}

function createFakeWorker(): Worker {
  return new FakeWorker() as unknown as Worker
}

function workersOf(pool: InstanceType<typeof WorkerPool>): Array<{ worker: FakeWorker }> {
  return (pool as any).workers
}

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

let exporter: InMemorySpanExporter
let spans: ReadableSpan[]
let reader: TestMetricReader
let handle: Awaited<ReturnType<typeof startTraceRuntime>>

beforeEach(async () => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  __setWorkerFactory(createFakeWorker)
  exporter = new InMemorySpanExporter()
  spans = []
  const harnessed = {
    export(batch: ReadableSpan[], cb: (result: { code: number }) => void) {
      spans.push(...batch)
      return exporter.export(batch, cb as never)
    },
    shutdown: () => exporter.shutdown(),
    forceFlush: () => exporter.forceFlush(),
  }
  reader = new TestMetricReader()
  handle = await startTraceRuntime({ resolution: resolution(), spanExporter: harnessed, metricReader: reader })
})

afterEach(async () => {
  __resetWorkerFactory()
  await stopTraceRuntime()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

describe('trace image worker — pool boundary', () => {
  it('distinguishes queue from execution and records only the coarse operation/byte bucket', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    const worker = workersOf(pool)[0]!.worker

    const promise = withSpanAsync('request.parent', () =>
      pool.process({ buffer: Buffer.alloc(1000), jpegQuality: 80 }, 'images.upload'),
    )
    const request = worker.posted[0]!
    worker.emit('message', {
      type: 'process:result',
      id: request.id,
      ok: true,
      result: { buffer: new Uint8Array([1, 2, 3]), width: 10, height: 10 },
    })
    await promise
    await handle.forceFlush()

    const parent = spans.find((span) => span.name === 'request.parent')
    const image = spans.find((span) => span.name === 'image.worker')
    expect(parent).toBeDefined()
    expect(image).toBeDefined()
    expect(image!.parentSpanContext?.spanId).toBe(parent!.spanContext().spanId)
    expect(image!.attributes['image.operation']).toBe('images.upload')
    expect(image!.attributes['image.size_bucket']).toBe('lt_64kb')
    expect(image!.attributes['image.outcome']).toBe('success')
    expect(image!.status.code).toBe(SpanStatusCode.OK)
    expect(JSON.stringify(image!.attributes)).not.toContain('storage/')
    expect(JSON.stringify(image!.attributes)).not.toContain('1000')

    const metrics = await reader.collectResourceMetrics()
    const queue = dataPointsOf(metrics, METRIC.imageQueueDuration)
    const execution = dataPointsOf(metrics, METRIC.imageExecutionDuration)
    expect(queue).toHaveLength(1)
    expect(execution).toHaveLength(1)
    expect(queue[0]!.attributes).toEqual({
      'image.operation': 'images.upload',
      'image.size_bucket': 'lt_64kb',
    })
    expect(execution[0]!.attributes).toEqual({
      'image.operation': 'images.upload',
      'image.size_bucket': 'lt_64kb',
      'image.outcome': 'success',
    })

    await pool.stop()
  })

  it('marks a worker failure as an error without exporting the error message', async () => {
    const pool = new WorkerPool(1, createFakeWorker)
    await pool.start()
    const worker = workersOf(pool)[0]!.worker

    const promise = pool.process({ buffer: Buffer.alloc(200_000), jpegQuality: 80 }, 'music.cover')
    const request = worker.posted[0]!
    worker.emit('message', {
      type: 'process:result',
      id: request.id,
      ok: false,
      error: { name: 'Error', message: 'secret storage key /var/lib/kobato/original.webp' },
    })
    await expect(promise).rejects.toThrow('secret storage key')

    await handle.forceFlush()
    const image = spans.find((span) => span.name === 'image.worker')
    expect(image!.status.code).toBe(SpanStatusCode.ERROR)
    expect(image!.attributes['image.outcome']).toBe('error')
    expect(image!.attributes['image.size_bucket']).toBe('lt_256kb')
    expect(JSON.stringify(image!.attributes)).not.toContain('secret storage key')
    expect(JSON.stringify(image!.attributes)).not.toContain('original.webp')

    const metrics = await reader.collectResourceMetrics()
    expect(dataPointsOf(metrics, METRIC.imageExecutionDuration)[0]!.attributes['image.outcome']).toBe('error')

    await pool.stop()
  })
})
