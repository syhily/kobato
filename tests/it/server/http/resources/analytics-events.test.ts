import { Hono } from 'hono'
import { createSession } from 'react-router'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { Env } from '@/server/http/context'
import type { RequestContext } from '@/server/http/request-context'
import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { clearAccessLog, closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { makeRequestContext as makeBaseRequestContext } from '#/_helpers/request-context'
import { __adoptAnalyticsHandleForTests, __resetAnalyticsEngineForTests } from '@/server/bootstrap/analytics-lifecycle'
import { __getRealtimeConnectionCountForTests } from '@/server/domains/analytics/services/realtime'
import { analyticsEventsRouter } from '@/server/http/resources/analytics'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

// The SSE resource against the real engine: the connection registry and
// cap policy run for real (that was always the point of these tests) and
// the poll loop's `queryRealtimeTail` now runs for real too, against a
// per-run DuckDB sidecar ADOPTED into the analytics lifecycle — no
// module mock. Broadcast delivery is asserted on the actual SSE frames.

let analyticsHandle: AnalyticsHandle

const ADMIN_VIEWER: SessionUser = {
  id: '1',
  name: 'Admin',
  email: 'admin@test.com',
  website: null,
  role: 'admin',
}

function makeRequestContext(sessionId: string, clientAddress: string): RequestContext {
  return makeBaseRequestContext({
    request: new Request('http://localhost/api/analytics/events'),
    session: createSession({ user: ADMIN_VIEWER }, sessionId) as unknown as RequestContext['session'],
    user: ADMIN_VIEWER,
    clientAddress,
  })
}

async function buildApp(sessionId: string, clientAddress = '127.0.0.1') {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', makeRequestContext(sessionId, clientAddress))
    c.set('requestId', 'test-request')
    await next()
  })
  app.route('/', analyticsEventsRouter)
  return app
}

async function openStream(app: Hono<Env>, sessionId: string, clientAddress = '127.0.0.1', query = '') {
  // Rebuild the middleware with the requested session identity. The router
  // itself is stateless; the context is what determines the cap key.
  const scoped = new Hono<Env>()
  scoped.use('*', async (c, next) => {
    c.set('requestContext', makeRequestContext(sessionId, clientAddress))
    c.set('requestId', 'test-request')
    await next()
  })
  scoped.route('/', analyticsEventsRouter)

  const res = await scoped.request(`/api/analytics/events${query}`)
  return res
}

async function closeStream(res: Response): Promise<void> {
  const before = __getRealtimeConnectionCountForTests()
  await res.body?.cancel()
  if (before === 0) {
    // The slot is already gone — the body was cancelled upstream (e.g.
    // readSseUntil cancels its reader, which releases through the same
    // stream-cancel path).
    return
  }
  // Wait for the cancel/abort path to actually release the registry slot
  // (decrement below `before`) instead of hoping a fixed 10ms sufficed.
  const released = await waitUntil(() => __getRealtimeConnectionCountForTests() < before, 2_000)
  expect(released).toBe(true)
}

/** Poll a condition on a short interval until it holds or the deadline
 *  passes — for outcomes that ride real event/I-O propagation (stream
 *  abort, the 2s poll loop) that fake timers cannot drive. */
async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() >= deadline) {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return true
}

/** Drain SSE frames until `needle` appears (or the deadline passes). */
async function readSseUntil(res: Response, needle: string, timeoutMs = 6_000): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const deadline = Date.now() + timeoutMs
  try {
    while (!buf.includes(needle) && Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(deadline - Date.now(), 1))),
      ])
      if (chunk === null || chunk.done) {
        break
      }
      buf += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  return buf
}

beforeAll(async () => {
  analyticsHandle = await createTestAnalyticsDb()
  // The real poll loop reads through the adopted handle.
  __adoptAnalyticsHandleForTests(analyticsHandle)
})

beforeEach(async () => {
  await clearAccessLog(analyticsHandle)
  __clearLogCaptureForTests()
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

describe('/api/analytics/events SSE per-session cap', () => {
  it('allows two concurrent SSE connections for the same session', async () => {
    const first = await openStream(await buildApp('session-a'), 'session-a')
    expect(first.status).toBe(200)
    expect(first.headers.get('Content-Type')).toContain('text/event-stream')

    const second = await openStream(await buildApp('session-a'), 'session-a')
    expect(second.status).toBe(200)

    await closeStream(first)
    await closeStream(second)
  })

  it('rejects a third SSE connection for the same session with 429', async () => {
    const first = await openStream(await buildApp('session-b'), 'session-b')
    const second = await openStream(await buildApp('session-b'), 'session-b')
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const third = await openStream(await buildApp('session-b'), 'session-b')
    expect(third.status).toBe(429)
    const body = (await third.json()) as { error: string }
    expect(body.error).toBe('Too many realtime connections for this session')

    await closeStream(first)
    await closeStream(second)
  })

  it('does not count connections from different sessions against each other', async () => {
    const connections: Response[] = []
    for (let i = 0; i < 4; i++) {
      const res = await openStream(await buildApp(`session-${i}`), `session-${i}`, `10.0.0.${i}`)
      expect(res.status).toBe(200)
      connections.push(res)
    }

    for (const res of connections) {
      await closeStream(res)
    }
  })

  it('decrements the counter when the client disconnects', async () => {
    const res = await openStream(await buildApp('session-c'), 'session-c')
    expect(res.status).toBe(200)

    await closeStream(res)

    // After the only connection closes, a new connection for the same session
    // should be accepted again.
    const again = await openStream(await buildApp('session-c'), 'session-c')
    expect(again.status).toBe(200)
    await closeStream(again)
  })
})

describe('/api/analytics/events realtime tail (real DuckDB)', () => {
  it('ignores an invalid since parameter', async () => {
    const res = await openStream(await buildApp('session-since'), 'session-since', '127.0.0.1', '?since=not-a-date')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    await closeStream(res)
  })

  it('polls the real tail and broadcasts seeded events as SSE frames', async () => {
    // ts inside the default 60s look-back window, so the first poll picks it up.
    await seedAccessEvents(analyticsHandle, [
      { ts: new Date(), visitorHash: 'rt', path: '/poll-seeded', browser: 'Chrome' },
    ])
    const res = await openStream(await buildApp('session-poll'), 'session-poll')
    expect(res.status).toBe(200)

    // The poll loop fires every 2s; wait for the 'event: events' frame.
    const frames = await readSseUntil(res, 'event: events')
    expect(frames).toContain('event: events')
    expect(frames).toContain('/poll-seeded')
    expect(frames).toContain('Chrome')

    await closeStream(res)
  })

  it('logs a warning when the realtime query fails', async () => {
    // Break the reader for real: with the engine reset, getAnalyticsReader
    // throws inside the poll loop and the resource logs the warning.
    __resetAnalyticsEngineForTests()
    try {
      const res = await openStream(await buildApp('session-warn'), 'session-warn')
      expect(res.status).toBe(200)
      // The poll loop fires every 2s — wait for the warn the first failed
      // query logs, with headroom for slow CI, instead of a fixed 2.5s
      // that races the first poll tick.
      await waitUntil(
        () => __logCaptureForTests().some((e) => e.level === 'warn' && e.msg === 'queryRealtimeTail failed'),
        10_000,
      )
      await closeStream(res)
      expect(__logCaptureForTests().some((e) => e.level === 'warn' && e.msg === 'queryRealtimeTail failed')).toBe(true)
    } finally {
      __adoptAnalyticsHandleForTests(analyticsHandle)
    }
  })
})
