import type { ReadableSpan } from '@opentelemetry/sdk-trace'

import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

const fileStoreMock = vi.hoisted(() => ({
  getItemWithExpiry: vi.fn<(bucket: string, key: string) => Promise<{ value: unknown; expiresAtMs: number } | null>>(),
  getItemRawWithExpiry:
    vi.fn<(bucket: string, key: string) => Promise<{ value: Buffer; expiresAtMs: number } | null>>(),
  removeItem: vi.fn<(bucket: string, key: string) => Promise<void>>(),
  setItem: vi.fn<(bucket: string, key: string, value: unknown, opts: unknown) => Promise<string>>(),
  setItemRaw: vi.fn<(bucket: string, key: string, value: Buffer, opts: unknown) => Promise<void>>(),
  readGeneration: vi.fn<(bucket: string) => Promise<number>>(),
  bumpGeneration: vi.fn<(bucket: string) => number>(),
  unlinkBucketEntriesSync: vi.fn<(bucket: string) => number>(),
  trashBucketSync: vi.fn<(bucket: string) => void>(),
}))

vi.mock('@/server/infra/cache/file-store', () => fileStoreMock)

import { TestMetricReader, dataPointsOf, pointValue } from '#/_helpers/in-memory-metric-reader'
import { __resetMemoryCacheForTests } from '@/server/infra/cache/memory-store'
import { get, through } from '@/server/infra/cache/registry'
import { __resetTraceFacadeForTests } from '@/server/infra/trace/facade'
import { METRIC } from '@/server/infra/trace/metrics'
import { startTraceRuntime, stopTraceRuntime } from '@/server/infra/trace/runtime'

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

let spanExporter: InMemorySpanExporter
let spans: ReadableSpan[]
let reader: TestMetricReader
let handle: Awaited<ReturnType<typeof startTraceRuntime>>

beforeEach(async () => {
  vi.stubEnv('DEV', true as never)
  __resetTraceFacadeForTests()
  __resetMemoryCacheForTests()
  fileStoreMock.getItemWithExpiry.mockResolvedValue(null)
  fileStoreMock.getItemRawWithExpiry.mockResolvedValue(null)
  fileStoreMock.removeItem.mockResolvedValue(undefined)
  fileStoreMock.setItem.mockImplementation(async (_bucket, _key, value) => JSON.stringify(value))
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
  handle = await startTraceRuntime({ resolution: resolution(), spanExporter: exporter, metricReader: reader })
})

afterEach(async () => {
  await stopTraceRuntime()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

function lookupSpans(): ReadableSpan[] {
  return spans.filter((span) => span.name === 'cache.lookup')
}

describe('cache registry trace — lookup boundary', () => {
  it('records a hit with bucket/result/coalesced and never the key or params', async () => {
    fileStoreMock.getItemWithExpiry.mockResolvedValue({ value: { secret: 'cached-payload' }, expiresAtMs: 0 })

    const value = await through('sitemap', { settingsRevision: 'secret-revision' }, async () => 'loaded')
    await handle.forceFlush()

    expect(value).toEqual({ secret: 'cached-payload' })
    const [span] = lookupSpans()
    expect(span).toBeDefined()
    expect(span!.attributes).toEqual({
      'cache.bucket': 'sitemap',
      'cache.result': 'hit',
      'cache.coalesced': false,
    })
    const serialized = JSON.stringify(span!.attributes)
    expect(serialized).not.toContain('secret-revision')
    expect(serialized).not.toContain('sitemap:xml')
    expect(serialized).not.toContain('cached-payload')
  })

  it('records a miss when the loader runs, and a coalesced join shares the load', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    fileStoreMock.getItemWithExpiry.mockImplementation(async () => {
      await gate
      return null
    })
    const loader = vi.fn(async () => 'loaded')

    const first = get('sitemap', { settingsRevision: 'rev' })
    const second = get('sitemap', { settingsRevision: 'rev' })
    release()
    await Promise.all([first, second])
    await handle.forceFlush()

    const lookups = lookupSpans()
    expect(lookups).toHaveLength(2)
    expect(lookups.map((span) => span.attributes['cache.result'])).toEqual(['miss', 'miss'])
    expect(lookups.map((span) => span.attributes['cache.coalesced'])).toEqual([false, true])
    // One shared read: the second lookup joined the first inflight promise.
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(1)
    expect(loader).not.toHaveBeenCalled()
  })

  it('keeps exactly one cache.lookup when the fire-and-forget write rejects', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      fileStoreMock.setItem.mockRejectedValue(new Error('disk down'))

      const value = await through('sitemap', { settingsRevision: 'secret-revision' }, async () => 'secret-payload')
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
      'cache.bucket': 'sitemap',
      'cache.result': 'miss',
      'cache.coalesced': false,
    })
    const serialized = JSON.stringify(span!.attributes)
    expect(serialized).not.toContain('secret-revision')
    expect(serialized).not.toContain('sitemap:xml')
    expect(serialized).not.toContain('secret-payload')

    // The write path adds no second metric sample.
    const metrics = await reader.collectResourceMetrics()
    expect(dataPointsOf(metrics, METRIC.cacheLookupCount)).toHaveLength(1)
  })

  it('records the cache lookup count metric with the same closed attributes', async () => {
    fileStoreMock.getItemWithExpiry.mockResolvedValue(null)

    await through('sitemap', { settingsRevision: 'rev' }, async () => 'loaded')
    await handle.forceFlush()

    const metrics = await reader.collectResourceMetrics()
    const points = dataPointsOf(metrics, METRIC.cacheLookupCount)
    expect(points).toHaveLength(1)
    expect(points[0]!.attributes).toEqual({
      'cache.bucket': 'sitemap',
      'cache.result': 'miss',
      'cache.coalesced': false,
    })
  })

  it('records an L1 hit as a cache hit without a second disk read', async () => {
    fileStoreMock.getItemWithExpiry.mockResolvedValue({ value: { cached: true }, expiresAtMs: 0 })
    const loader = vi.fn(async () => 'loaded')

    await through('sitemap', { settingsRevision: 'rev' }, loader)
    const second = await through('sitemap', { settingsRevision: 'rev' }, loader)
    await handle.forceFlush()

    expect(second).toEqual({ cached: true })
    expect(fileStoreMock.getItemWithExpiry).toHaveBeenCalledTimes(1)
    expect(loader).not.toHaveBeenCalled()
    expect(lookupSpans().map((span) => span.attributes['cache.result'])).toEqual(['hit', 'hit'])

    const points = dataPointsOf(await reader.collectResourceMetrics(), METRIC.cacheLookupCount)
    expect(points).toHaveLength(1)
    expect(points[0]!.attributes).toEqual({
      'cache.bucket': 'sitemap',
      'cache.result': 'hit',
      'cache.coalesced': false,
    })
    expect(pointValue(points[0]!)).toBe(2)
  })
})
