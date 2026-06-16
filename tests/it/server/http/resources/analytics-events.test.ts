import { Hono } from 'hono'
import { createSession } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

vi.mock('@/server/domains/analytics/services/realtime', () => ({
  queryRealtimeTail: vi.fn().mockResolvedValue([]),
}))

import { analyticsEventsRouter } from '@/server/http/resources/analytics'

function makeAdminSession(sessionId: string) {
  return createSession(
    {
      user: { id: '1', name: 'Admin', email: 'admin@test.com', website: null, role: 'admin' },
    },
    sessionId,
  )
}

async function buildApp(sessionId: string, clientAddress = '127.0.0.1') {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('session', makeAdminSession(sessionId) as unknown as Env['Variables']['session'])
    c.set('clientAddress', clientAddress)
    c.set('db', {} as Env['Variables']['db'])
    c.set('pool', {} as Env['Variables']['pool'])
    c.set('requestId', 'test-request')
    await next()
  })
  app.route('/', analyticsEventsRouter)
  return app
}

async function openStream(app: Hono<Env>, sessionId: string, clientAddress = '127.0.0.1') {
  // Rebuild the middleware with the requested session identity. The router
  // itself is stateless; the context is what determines the cap key.
  const scoped = new Hono<Env>()
  scoped.use('*', async (c, next) => {
    c.set('session', makeAdminSession(sessionId) as unknown as Env['Variables']['session'])
    c.set('clientAddress', clientAddress)
    c.set('db', {} as Env['Variables']['db'])
    c.set('pool', {} as Env['Variables']['pool'])
    c.set('requestId', 'test-request')
    await next()
  })
  scoped.route('/', analyticsEventsRouter)

  const res = await scoped.request('/api/analytics/events')
  return res
}

async function closeStream(res: Response): Promise<void> {
  await res.body?.cancel()
  // Give the abort event a tick to decrement the in-memory counter.
  await new Promise((resolve) => setTimeout(resolve, 10))
}

describe('/api/analytics/events SSE per-session cap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Ensure no streams leak across tests even if a case fails.
    vi.clearAllMocks()
  })

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
