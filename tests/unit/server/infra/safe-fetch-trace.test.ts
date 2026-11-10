import type { ReadableSpan } from '@opentelemetry/sdk-trace'
import type { Mock } from 'vitest'

import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { lookup } from 'node:dns/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

import { TestMetricReader } from '#/_helpers/in-memory-metric-reader'
import { safeFetch } from '@/server/infra/safe-fetch'
import { __resetTraceFacadeForTests } from '@/server/infra/trace/facade'
import { startTraceRuntime, stopTraceRuntime } from '@/server/infra/trace/runtime'

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

const lookupMock = lookup as unknown as Mock<(hostname: string, options?: unknown) => Promise<unknown>>

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
let handle: Awaited<ReturnType<typeof startTraceRuntime>>

beforeEach(async () => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
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
  handle = await startTraceRuntime({
    resolution: resolution(),
    spanExporter: harnessed,
    metricReader: new TestMetricReader(),
  })
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await stopTraceRuntime()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

function mockFetch(handler: () => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => handler()),
  )
}

describe('trace outbound — safeFetch boundary', () => {
  it('records a CLIENT span with only operation/method/status, never the URL', async () => {
    mockFetch(() => new Response('ok', { status: 200 }))

    const result = await safeFetch('https://cdn.example.com/covers/secret.png?token=hunter2', {
      operation: 'og.cover',
    })
    await handle.forceFlush()

    expect(result.ok).toBe(true)
    const [span] = spans
    expect(span!.name).toBe('http.client')
    expect(span!.kind).toBe(SpanKind.CLIENT)
    expect(span!.attributes).toEqual({
      'http.request.method': 'GET',
      'http.client.operation': 'og.cover',
      'http.response.status_code': 200,
    })
    expect(span!.status.code).toBe(SpanStatusCode.OK)

    const serialized = JSON.stringify(span!.attributes)
    expect(serialized).not.toContain('cdn.example.com')
    expect(serialized).not.toContain('secret.png')
    expect(serialized).not.toContain('hunter2')
  })

  it('records an HTTP failure as an error with the status but no URL', async () => {
    mockFetch(() => new Response(null, { status: 404 }))

    const result = await safeFetch('https://cdn.example.com/missing?token=hunter2', {
      operation: 'music.asset',
    })
    await handle.forceFlush()

    expect(result).toMatchObject({ ok: false, reason: 'http-error', status: 404 })
    const [span] = spans
    expect(span!.status.code).toBe(SpanStatusCode.ERROR)
    expect(span!.attributes['http.response.status_code']).toBe(404)
    expect(span!.attributes['error.category']).toBe('http_client_http_error')
    expect(Object.keys(span!.attributes).sort()).toEqual([
      'error.category',
      'http.client.operation',
      'http.request.method',
      'http.response.status_code',
    ])
    expect(JSON.stringify(span!.attributes)).not.toContain('cdn.example.com')
    expect(JSON.stringify(span!.attributes)).not.toContain('hunter2')
  })

  it('falls back to the fixed unspecified operation and keeps GET for a validation failure', async () => {
    const result = await safeFetch('ftp://example.com/secret')
    await handle.forceFlush()

    expect(result).toMatchObject({ ok: false, reason: 'bad-protocol' })
    const [span] = spans
    expect(span!.attributes['http.client.operation']).toBe('unspecified')
    expect(span!.attributes['error.category']).toBe('http_client_bad_protocol')
    expect(span!.attributes['http.request.method']).toBe('GET')
  })
})
