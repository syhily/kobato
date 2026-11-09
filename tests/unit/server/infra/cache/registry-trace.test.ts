import type { ReadableSpan } from '@opentelemetry/sdk-trace'

import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

const fileStoreMock = vi.hoisted(() => ({
  getItem: vi.fn<(bucket: string, key: string) => Promise<unknown>>(),
  getItemRaw: vi.fn<(bucket: string, key: string) => Promise<Buffer | null>>(),
  getItems: vi.fn<(bucket: string, keys: string[]) => Promise<{ key: string; value: unknown }[]>>(),
  removeItem: vi.fn<(bucket: string, key: string) => Promise<void>>(),
  setItem: vi.fn<(bucket: string, key: string, value: unknown, opts: unknown) => Promise<void>>(),
  setItemRaw: vi.fn<(bucket: string, key: string, value: Buffer, opts: unknown) => Promise<void>>(),
  readGeneration: vi.fn<(bucket: string) => Promise<number>>(),
  bumpGeneration: vi.fn<(bucket: string) => number>(),
  unlinkBucketEntriesSync: vi.fn<(bucket: string) => number>(),
  trashBucketSync: vi.fn<(bucket: string) => void>(),
}))

vi.mock('@/server/infra/cache/file-store', () => fileStoreMock)

import { TestMetricReader, dataPointsOf } from '#/_helpers/in-memory-metric-reader'
import { get, through, throughMany } from '@/server/infra/cache/registry'
import { __resetTraceFacadeForTests } from '@/server/infra/trace/facade'
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
}

function resolution(): TraceConfigResolution {
  return { status: 'active', server: CONFIG, frontend: null, diagnostics: [] }
}

let spanExporter: InMemorySpanExporter
let spans: ReadableSpan[]
let reader: TestMetricReader
let handle: Awaited<ReturnType<typeof startDevTrace>>

beforeEach(async () => {
  vi.stubEnv('DEV', true as never)
  __resetTraceFacadeForTests()
  fileStoreMock.getItem.mockResolvedValue(null)
  fileStoreMock.getItemRaw.mockResolvedValue(null)
  fileStoreMock.getItems.mockImplementation(async (_bucket, keys) => keys.map((key) => ({ key, value: null })))
  fileStoreMock.removeItem.mockResolvedValue(undefined)
  fileStoreMock.setItem.mockResolvedValue(undefined)
  fileStoreMock.setItemRaw.mockResolvedValue(undefined)
  fileStoreMock.readGeneration.mockResolvedValue(0)
  fileStoreMock.bumpGeneration.mockReturnValue(1)
  fileStoreMock.unlinkBucketEntriesSync.mockReturnValue(0)
  fileStoreMock.trashBucketSync.mockReturnValue(undefined)

  spanExporter = new InMemorySpanExporter()
  spans = []
  const exporter = {
    export(batch: ReadableSpan[], cb: (result: { code: number }) => void) {
      spans.push(...batch)
      return spanExporter.export(batch, cb as never)
    },
    shutdown: () => spanExporter.shutdown(),
    forceFlush: () => spanExporter.forceFlush(),
  }
  reader = new TestMetricReader()
  handle = await startDevTrace({ resolution: resolution(), spanExporter: exporter, metricReader: reader })
})

afterEach(async () => {
  await stopDevTrace()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

function lookupSpans(): ReadableSpan[] {
  return spans.filter((span) => span.name === 'cache.lookup')
}

describe('cache registry trace — lookup boundary', () => {
  it('records a hit with bucket/result/coalesced and never the key or params', async () => {
    fileStoreMock.getItem.mockResolvedValue({ secret: 'cached-payload' })

    const value = await through('comments', { settingsRevision: 'secret-revision', limit: 7 }, async () => 'loaded')
    await handle.forceFlush()

    expect(value).toEqual({ secret: 'cached-payload' })
    const [span] = lookupSpans()
    expect(span).toBeDefined()
    expect(span!.attributes).toEqual({
      'cache.bucket': 'comments',
      'cache.result': 'hit',
      'cache.coalesced': false,
    })
    const serialized = JSON.stringify(span!.attributes)
    expect(serialized).not.toContain('secret-revision')
    expect(serialized).not.toContain('comments:')
    expect(serialized).not.toContain('cached-payload')
  })

  it('records a miss when the loader runs, and a coalesced join shares the load', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    fileStoreMock.getItem.mockImplementation(async () => {
      await gate
      return null
    })
    const loader = vi.fn(async () => 'loaded')

    const first = get('tags', {})
    const second = get('tags', {})
    release()
    await Promise.all([first, second])
    await handle.forceFlush()

    const lookups = lookupSpans()
    expect(lookups).toHaveLength(2)
    expect(lookups.map((span) => span.attributes['cache.result'])).toEqual(['miss', 'miss'])
    expect(lookups.map((span) => span.attributes['cache.coalesced'])).toEqual([false, true])
    // One shared read: the second lookup joined the first inflight promise.
    expect(fileStoreMock.getItem).toHaveBeenCalledTimes(1)
    expect(loader).not.toHaveBeenCalled()
  })

  it('records a batch lookup once per call with a hit/miss result', async () => {
    fileStoreMock.getItems.mockImplementation(async (_bucket, keys) =>
      keys.map((key) => ({ key, value: 'cached-batch' })),
    )

    const result = await throughMany('tags', [{}, {}], async () => [])
    await handle.forceFlush()

    expect(result.map((entry) => entry.value)).toEqual(['cached-batch', 'cached-batch'])
    const [span] = lookupSpans()
    expect(span!.attributes).toEqual({
      'cache.bucket': 'tags',
      'cache.result': 'hit',
      'cache.coalesced': false,
    })
  })

  it('keeps exactly one cache.lookup when the fire-and-forget write rejects', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      fileStoreMock.setItem.mockRejectedValue(new Error('disk down'))

      const value = await through(
        'comments',
        { settingsRevision: 'secret-revision', limit: 7 },
        async () => 'secret-payload',
      )
      expect(value).toBe('secret-payload')

      // Let the rejected write settle inside writeEntry's catch.
      await new Promise((resolve) => setImmediate(resolve))
      await handle.forceFlush()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    expect(unhandled).toEqual([])

    const cacheSpans = spans.filter((span) => span.name.startsWith('cache'))
    expect(cacheSpans.map((span) => span.name)).toEqual(['cache.lookup'])
    const [span] = lookupSpans()
    expect(span!.attributes).toEqual({
      'cache.bucket': 'comments',
      'cache.result': 'miss',
      'cache.coalesced': false,
    })
    const serialized = JSON.stringify(span!.attributes)
    expect(serialized).not.toContain('secret-revision')
    expect(serialized).not.toContain('comments:')
    expect(serialized).not.toContain('secret-payload')

    // The write path adds no second metric sample.
    const metrics = await reader.collectResourceMetrics()
    expect(dataPointsOf(metrics, METRIC.cacheLookupCount)).toHaveLength(1)
  })

  it('records the cache lookup count metric with the same closed attributes', async () => {
    fileStoreMock.getItem.mockResolvedValue(null)

    await through('tags', {}, async () => 'loaded')
    await handle.forceFlush()

    const metrics = await reader.collectResourceMetrics()
    const points = dataPointsOf(metrics, METRIC.cacheLookupCount)
    expect(points).toHaveLength(1)
    expect(points[0]!.attributes).toEqual({
      'cache.bucket': 'tags',
      'cache.result': 'miss',
      'cache.coalesced': false,
    })
  })
})
