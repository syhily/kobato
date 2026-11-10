import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace'
import type { Context } from 'hono'

import { SpanKind, SpanStatusCode } from '@opentelemetry/api'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { ORPCError, createRouterClient, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'
import { RouterContextProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

import { TestMetricReader, dataPointsOf, pointValue } from '#/_helpers/in-memory-metric-reader'
import { makeRequestContext } from '#/_helpers/request-context'
import { createOrpcTraceInterceptor } from '@/server/http/orpc-trace'
import { requestContext } from '@/server/http/request-context'
import { __resetTraceFacadeForTests } from '@/server/infra/trace/facade'
import { METRIC } from '@/server/infra/trace/metrics'
import { devTraceRequestMiddleware } from '@/server/infra/trace/middleware'
import { traceRouteMiddleware } from '@/server/infra/trace/react-router'
import { startDevTrace, stopDevTrace } from '@/server/infra/trace/runtime'

const renderHarness = vi.hoisted(() => {
  const state: {
    options: Record<string, unknown> | null
    body: { end: () => void; destroy: (error?: Error) => void } | null
    behavior: 'shell' | 'shell-error' | 'sync-throw'
    throwError: Error | null
  } = { options: null, body: null, behavior: 'shell', throwError: null }

  return {
    state,
    reset() {
      state.options = null
      state.body = null
      state.behavior = 'shell'
      state.throwError = null
    },
    render: vi.fn((_element: unknown, options: Record<string, unknown>) => {
      state.options = options
      if (state.behavior === 'sync-throw') {
        throw state.throwError ?? new Error('secret sync render failure')
      }
      if (state.behavior === 'shell-error') {
        queueMicrotask(() => {
          ;(options.onShellError as ((error: unknown) => void) | undefined)?.(new Error('secret shell failure'))
        })
      } else {
        queueMicrotask(() => {
          ;(options.onShellReady as (() => void) | undefined)?.()
        })
      }
      return {
        pipe(body: unknown) {
          state.body = body as typeof state.body
        },
        abort() {},
      }
    }),
  }
})

vi.mock('react-dom/server', () => ({ renderToPipeableStream: renderHarness.render }))
vi.mock('@react-router/node', () => ({ createReadableStreamFromReadable: (stream: unknown) => stream }))

const { default: handleRequest } = await import('@/entry.server')

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

interface TestCtx {
  value: string
}

const procedure = os.$context<TestCtx>()

const testRouter = {
  demo: {
    ping: procedure.input(z.object({ secret: z.string() })).handler(({ input }) => ({ echoed: input.secret })),
    fail: procedure.handler(() => {
      throw new ORPCError('BAD_REQUEST', { message: 'secret procedure failure' })
    }),
  },
}

const rpcHandler = new RPCHandler(testRouter, {
  clientInterceptors: [createOrpcTraceInterceptor('http')],
})

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const REMOTE_SPAN_ID = '00f067aa0ba902b7'
const TRACEPARENT = `00-${TRACE_ID}-${REMOTE_SPAN_ID}-01`

let harness: ExporterHarness
let metricReader: TestMetricReader
let handle: Awaited<ReturnType<typeof startDevTrace>>

beforeEach(async () => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  renderHarness.reset()
  harness = createExporterHarness()
  metricReader = new TestMetricReader()
  handle = await startDevTrace({
    resolution: resolution(),
    spanExporter: harness.exporter,
    metricReader,
  })
})

afterEach(async () => {
  await stopDevTrace()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

function routerContext(): unknown {
  return {
    staticHandlerContext: {
      loaderData: { root: { i18n: { locale: 'en-US', messages: {} } } },
      actionData: null,
      errors: null,
      statusCode: 200,
      location: { pathname: '/' },
      matches: [],
    },
    manifest: {},
    routeModules: {},
    criticalCss: null,
    serverHandoffString: '{}',
    serverHandoffStream: null,
    renderMeta: {},
    future: {},
    ssr: true,
    routeDiscovery: { mode: 'initial' },
    isSpaMode: false,
    serializeError: (error: unknown) => error,
  }
}

function loadContext(): unknown {
  const rc = makeRequestContext()
  return {
    get: (key: unknown) => (key === requestContext ? rc : undefined),
  }
}

function patternFor(pathname: string): string {
  if (pathname.startsWith('/posts/')) {
    return '/posts/:slug'
  }
  if (pathname.startsWith('/rpc/')) {
    return '/rpc/*'
  }
  return pathname === '/' ? '/' : pathname
}

async function reactRouterRequest(c: Context): Promise<Response> {
  const pathname = c.req.path

  if (pathname === '/not-modified') {
    return new Response(null, { status: 304 })
  }
  if (pathname === '/redirect') {
    return new Response(null, { status: 302, headers: { Location: '/target' } })
  }
  if (pathname === '/boom') {
    throw new Error('secret route failure at http://localhost/private?token=abc')
  }
  if (pathname === '/unavailable') {
    return new Response('unavailable', { status: 503 })
  }

  // A loader-shaped in-process call through the same seam `createSsrCaller` uses.
  const caller = createRouterClient(testRouter, {
    context: { value: 'ssr' },
    interceptors: [createOrpcTraceInterceptor('in_process')],
  })
  await caller.demo.ping({ secret: 'hunter2' })

  if (pathname.endsWith('.data')) {
    return Response.json({ ok: true })
  }

  return handleRequest(c.req.raw, 200, new Headers(), routerContext() as never, loadContext() as never)
}

function buildApp(): Hono {
  const app = new Hono()

  app.use(devTraceRequestMiddleware())

  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.get('/ready', (c) => c.json({ status: 'ok' }))

  app.all('/rpc/*', async (c) => {
    const result = await rpcHandler.handle(c.req.raw, { prefix: '/rpc', context: { value: 'http' } })
    return result.matched ? result.response : c.notFound()
  })

  app.all('*', async (c) => {
    return traceRouteMiddleware(
      {
        request: c.req.raw,
        url: new URL(c.req.url),
        params: {},
        pattern: patternFor(c.req.path),
        context: new RouterContextProvider(),
      } as never,
      () => reactRouterRequest(c),
    )
  })

  return app
}

function byName(name: string): ReadableSpan {
  const span = harness.spans.find((candidate) => candidate.name === name)
  expect(span, `expected a span named ${name}; got ${harness.spans.map((s) => s.name).join(', ')}`).toBeDefined()
  return span!
}

async function finishStream(): Promise<void> {
  renderHarness.state.body?.end()
  await handle.forceFlush()
}

async function flush(): Promise<void> {
  await handle.forceFlush()
}

describe('trace waterfall — document request', () => {
  it('parents Hono → React Router → in-process oRPC → SSR shell/stream under the W3C trace', async () => {
    const app = buildApp()

    const response = await app.request('/posts/hello?utm=secret', {
      headers: { traceparent: TRACEPARENT },
    })
    expect(response.status).toBe(200)
    await finishStream()

    const http = byName('http.server')
    const rr = byName('rr.document')
    const orpc = byName('orpc.demo.ping')
    const shell = byName('ssr.shell')
    const stream = byName('ssr.stream')

    expect(http.spanContext().traceId).toBe(TRACE_ID)
    expect(http.parentSpanContext?.spanId).toBe(REMOTE_SPAN_ID)

    expect(rr.parentSpanContext?.spanId).toBe(http.spanContext().spanId)
    expect(orpc.parentSpanContext?.spanId).toBe(rr.spanContext().spanId)
    expect(shell.parentSpanContext?.spanId).toBe(rr.spanContext().spanId)
    expect(stream.parentSpanContext?.spanId).toBe(rr.spanContext().spanId)

    expect(http.kind).toBe(SpanKind.SERVER)
    expect(http.attributes['http.request.method']).toBe('GET')
    expect(http.attributes['http.route']).toBe('/posts/:slug')
    expect(http.attributes['http.response.status_code']).toBe(200)

    expect(rr.attributes['rr.request.kind']).toBe('document')
    expect(rr.attributes['rr.route']).toBe('/posts/:slug')
    expect(rr.attributes['http.response.status_code']).toBe(200)
    expect(rr.status.code).toBe(SpanStatusCode.OK)

    expect(orpc.attributes['orpc.procedure']).toBe('demo.ping')
    expect(orpc.attributes['orpc.transport']).toBe('in_process')
    expect(orpc.status.code).toBe(SpanStatusCode.OK)

    expect(shell.attributes['ssr.phase']).toBe('shell')
    expect(stream.attributes['ssr.phase']).toBe('stream')
    expect(stream.attributes['ssr.outcome']).toBe('completed')
    expect(stream.status.code).toBe(SpanStatusCode.OK)

    // Privacy: no raw path/query, no procedure input, no traceparent header echo.
    const serialized = JSON.stringify(harness.spans.map((span) => span.attributes))
    expect(serialized).not.toContain('/posts/hello')
    expect(serialized).not.toContain('utm=secret')
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain(TRACEPARENT)
  })

  it('records a `.data` request as rr.data and never renders the SSR entry', async () => {
    const app = buildApp()

    const response = await app.request('/posts/hello.data', {
      headers: { traceparent: TRACEPARENT },
    })
    expect(response.status).toBe(200)
    await flush()

    expect(byName('rr.data').attributes['rr.request.kind']).toBe('data')
    expect(harness.spans.some((span) => span.name === 'ssr.shell')).toBe(false)
    expect(renderHarness.render).not.toHaveBeenCalled()
  })
})

describe('trace waterfall — exclusions', () => {
  it('emits no span for /health or /ready', async () => {
    const app = buildApp()

    expect((await app.request('/health', { headers: { traceparent: TRACEPARENT } })).status).toBe(200)
    expect((await app.request('/ready', { headers: { traceparent: TRACEPARENT } })).status).toBe(200)
    await flush()

    expect(harness.spans).toHaveLength(0)
  })
})

describe('trace waterfall — oRPC HTTP transport', () => {
  it('names the HTTP procedure and marks the transport without recording input', async () => {
    const app = buildApp()

    const response = await app.request('/rpc/demo/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', traceparent: TRACEPARENT },
      body: JSON.stringify({ json: { secret: 'hunter2' } }),
    })
    expect(response.status).toBe(200)
    await flush()

    const http = byName('http.server')
    const orpc = byName('orpc.demo.ping')

    expect(orpc.attributes['orpc.transport']).toBe('http')
    expect(orpc.attributes['orpc.procedure']).toBe('demo.ping')
    expect(orpc.parentSpanContext?.spanId).toBe(http.spanContext().spanId)
    expect(http.attributes['http.route']).toBe('/rpc/*')
    expect(JSON.stringify(harness.spans.map((span) => span.attributes))).not.toContain('hunter2')
  })

  it('projects an ORPCError to a stable category without its message', async () => {
    const app = buildApp()

    const response = await app.request('/rpc/demo/fail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: {} }),
    })
    expect(response.status).toBe(400)
    await flush()

    const orpc = byName('orpc.demo.fail')
    expect(orpc.status.code).toBe(SpanStatusCode.ERROR)
    expect(orpc.attributes['error.type']).toBe('ORPCError')
    expect(orpc.attributes['error.category']).toBe('orpc_bad_request')
    expect(JSON.stringify(orpc.attributes)).not.toContain('secret procedure failure')
  })
})

describe('trace waterfall — response status handling', () => {
  it('keeps 304 and 302 as successful control flow', async () => {
    const app = buildApp()

    const notModified = await app.request('/not-modified')
    expect(notModified.status).toBe(304)
    const redirect = await app.request('/redirect', { redirect: 'manual' })
    expect(redirect.status).toBe(302)
    await flush()

    const rrSpans = harness.spans.filter((span) => span.name === 'rr.document')
    expect(rrSpans.map((span) => span.attributes['http.response.status_code'])).toEqual([304, 302])
    expect(rrSpans.every((span) => span.status.code === SpanStatusCode.OK)).toBe(true)
    expect(
      harness.spans
        .filter((span) => span.name === 'http.server')
        .every((span) => span.status.code === SpanStatusCode.OK),
    ).toBe(true)
  })

  it('marks a thrown React Router error and a 503 response as errors without leaking messages', async () => {
    const app = buildApp()

    const boom = await app.request('/boom')
    expect(boom.status).toBe(500)
    const unavailable = await app.request('/unavailable')
    expect(unavailable.status).toBe(503)
    await flush()

    const rrError = harness.spans.find(
      (span) =>
        span.name === 'rr.document' && span.status.code === SpanStatusCode.ERROR && span.attributes['error.category'],
    )
    expect(rrError?.attributes['error.type']).toBe('Error')
    expect(rrError?.attributes['error.category']).toBe('unknown')

    const httpError = harness.spans.find(
      (span) => span.name === 'http.server' && span.attributes['error.category'] === 'http_503',
    )
    expect(httpError?.status.code).toBe(SpanStatusCode.ERROR)
    expect(httpError?.attributes['http.response.status_code']).toBe(503)

    const serialized = JSON.stringify(harness.spans.map((span) => span.attributes))
    expect(serialized).not.toContain('secret route failure')
    expect(serialized).not.toContain('localhost/private')
  })
})

describe('trace waterfall — SSR stream lifecycle', () => {
  it('ends ssr.stream as aborted when the client destroys the body', async () => {
    const app = buildApp()

    const response = await app.request('/posts/hello')
    expect(response.status).toBe(200)
    renderHarness.state.body?.destroy()
    await new Promise((resolve) => setImmediate(resolve))
    await flush()

    const stream = byName('ssr.stream')
    expect(stream.attributes['ssr.outcome']).toBe('aborted')
    expect(stream.status.code).toBe(SpanStatusCode.OK)
  })

  it('ends ssr.stream as error without exporting the error message', async () => {
    const app = buildApp()

    const response = await app.request('/posts/hello')
    expect(response.status).toBe(200)
    renderHarness.state.body?.destroy(new Error('secret stream failure'))
    await new Promise((resolve) => setImmediate(resolve))
    await flush()

    const stream = byName('ssr.stream')
    expect(stream.attributes['ssr.outcome']).toBe('error')
    expect(stream.status.code).toBe(SpanStatusCode.ERROR)
    expect(stream.attributes['error.type']).toBe('Error')
    expect(JSON.stringify(stream.attributes)).not.toContain('secret stream failure')
  })

  it('keeps the error outcome when a streaming error is followed by a normal finish', async () => {
    const app = buildApp()

    const response = await app.request('/posts/hello')
    expect(response.status).toBe(200)
    ;(renderHarness.state.options?.onError as ((error: unknown) => void) | undefined)?.(
      new Error('secret streaming failure'),
    )
    renderHarness.state.body?.end()
    await flush()

    const stream = byName('ssr.stream')
    expect(stream.attributes['ssr.outcome']).toBe('error')
    expect(stream.status.code).toBe(SpanStatusCode.ERROR)
    expect(JSON.stringify(stream.attributes)).not.toContain('secret streaming failure')
  })

  it('handles a synchronous renderer throw: one error shell span, no stream span, timer cleared, error preserved', async () => {
    const error = new Error('secret sync render failure at http://localhost/private')
    renderHarness.state.behavior = 'sync-throw'
    renderHarness.state.throwError = error

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    try {
      await expect(
        handleRequest(
          new Request('http://localhost/posts/hello'),
          200,
          new Headers(),
          routerContext() as never,
          loadContext() as never,
        ),
      ).rejects.toBe(error)

      await flush()

      const shells = harness.spans.filter((span) => span.name === 'ssr.shell')
      expect(shells).toHaveLength(1)
      expect(shells[0]!.status.code).toBe(SpanStatusCode.ERROR)
      expect(shells[0]!.attributes['error.type']).toBe('Error')
      expect(harness.spans.some((span) => span.name === 'ssr.stream')).toBe(false)

      const attributes = JSON.stringify(shells[0]!.attributes)
      expect(attributes).not.toContain('secret sync render failure')
      expect(attributes).not.toContain('localhost/private')

      // The entry schedules `streamTimeout + 1000`; the synchronous throw path
      // must clear exactly that timer.
      const timerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 6000)
      expect(timerIndex).toBeGreaterThanOrEqual(0)
      const timerId = setTimeoutSpy.mock.results[timerIndex]?.value
      expect(clearTimeoutSpy.mock.calls.some(([id]) => id === timerId)).toBe(true)
    } finally {
      setTimeoutSpy.mockRestore()
      clearTimeoutSpy.mockRestore()
    }
  })

  it('ends ssr.shell as error when the shell never renders', async () => {
    renderHarness.state.behavior = 'shell-error'
    const app = buildApp()

    const response = await app.request('/posts/hello')
    expect(response.status).toBe(500)
    await flush()

    const shell = byName('ssr.shell')
    expect(shell.status.code).toBe(SpanStatusCode.ERROR)
    expect(harness.spans.some((span) => span.name === 'ssr.stream')).toBe(false)
    expect(JSON.stringify(shell.attributes)).not.toContain('secret shell failure')
  })
})

describe('trace waterfall — bounded metrics', () => {
  it('records HTTP and SSR duration/count with the same low-cardinality labels as the spans', async () => {
    const app = buildApp()

    const response = await app.request('/posts/hello?utm=secret', {
      headers: { traceparent: TRACEPARENT },
    })
    expect(response.status).toBe(200)
    await finishStream()

    const metrics = await metricReader.collectResourceMetrics()
    const httpDuration = dataPointsOf(metrics, METRIC.httpServerDuration)
    expect(httpDuration).toHaveLength(1)
    expect(httpDuration[0]!.attributes).toEqual({
      'http.request.method': 'GET',
      'http.route': '/posts/:slug',
      'http.response.status_code': 200,
    })
    expect(pointValue(httpDuration[0]!)).toBeGreaterThanOrEqual(0)

    const httpRequests = dataPointsOf(metrics, METRIC.httpServerRequests)
    expect(pointValue(httpRequests[0]!)).toBe(1)
    expect(httpRequests[0]!.attributes).toEqual(httpDuration[0]!.attributes)

    const shell = dataPointsOf(metrics, METRIC.ssrShellDuration)
    const stream = dataPointsOf(metrics, METRIC.ssrStreamDuration)
    expect(shell).toHaveLength(1)
    expect(stream).toHaveLength(1)
    expect(shell[0]!.attributes).toEqual({ 'ssr.outcome': 'ok' })
    expect(stream[0]!.attributes).toEqual({ 'ssr.outcome': 'completed' })

    const serialized = JSON.stringify(metrics.scopeMetrics)
    expect(serialized).not.toContain('/posts/hello')
    expect(serialized).not.toContain('utm=secret')
  })

  it('labels an error response without exporting its body', async () => {
    const app = buildApp()

    const response = await app.request('/unavailable')
    expect(response.status).toBe(503)
    await flush()

    const metrics = await metricReader.collectResourceMetrics()
    const points = dataPointsOf(metrics, METRIC.httpServerDuration)
    expect(points).toHaveLength(1)
    expect(points[0]!.attributes['http.response.status_code']).toBe(503)
    expect(Object.keys(points[0]!.attributes).sort()).toEqual([
      'http.request.method',
      'http.response.status_code',
      'http.route',
    ])
  })
})
