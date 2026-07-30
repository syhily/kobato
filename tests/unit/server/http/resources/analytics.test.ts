import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

const queryRealtimeTail = vi.fn().mockResolvedValue([])

vi.mock('@/server/bootstrap/analytics-lifecycle', () => ({
  getAnalyticsReader: () => ({}),
}))

vi.mock('@/server/domains/analytics/services/realtime', async (importOriginal) => ({
  // Keep the real connection registry + cap policy — these tests drive it
  // through the Hono resource — and stub only the tail query the poll
  // loop runs. The registry itself is pinned at the domain seam in
  // tests/unit/server/domains/analytics/services/realtime.test.ts.
  ...(await importOriginal<typeof import('@/server/domains/analytics/services/realtime')>()),
  queryRealtimeTail: (...args: unknown[]) => queryRealtimeTail(...args),
}))

vi.mock('@/server/http/middlewares/hono-rbac', () => ({
  requireRoleMw: () => async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

import { analyticsEventsRouter } from '@/server/http/resources/analytics'

const makeApp = (sessionId?: string) => {
  const session = {
    id: sessionId,
    get: vi.fn(() => (sessionId ? { id: 'u1', role: 'admin' } : undefined)),
  }
  const app = new Hono<Env>()
    .use(async (c, next) => {
      c.set('requestContext', {
        session,
        clientAddress: '127.0.0.1',
        db: {},
      } as never)
      await next()
    })
    .route('/', analyticsEventsRouter)
  return { app, session }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('analytics events SSE', () => {
  const controllers: AbortController[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    queryRealtimeTail.mockResolvedValue([])
  })

  afterEach(() => {
    controllers.splice(0).forEach((c) => c.abort())
  })

  it('returns an SSE stream for an admin session', async () => {
    const { app } = makeApp('s1')
    const controller = new AbortController()
    controllers.push(controller)
    const res = await app.request('http://localhost/api/analytics/events', { signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
  })

  it('falls back to ip key when there is no session id', async () => {
    const { app } = makeApp(undefined)
    const controller = new AbortController()
    controllers.push(controller)
    const res = await app.request('http://localhost/api/analytics/events', { signal: controller.signal })
    expect(res.status).toBe(200)
  })

  it('rejects too many concurrent connections', async () => {
    const { app } = makeApp('s2')
    for (let i = 0; i < 3; i += 1) {
      const controller = new AbortController()
      controllers.push(controller)
      const res = await app.request('http://localhost/api/analytics/events', { signal: controller.signal })
      if (i < 2) {
        expect(res.status).toBe(200)
      } else {
        expect(res.status).toBe(429)
      }
    }
  })

  it('ignores an invalid since parameter', async () => {
    const { app } = makeApp('s3')
    const controller = new AbortController()
    controllers.push(controller)
    const res = await app.request('http://localhost/api/analytics/events?since=not-a-date', {
      signal: controller.signal,
    })
    expect(res.status).toBe(200)
  })

  it('polls realtime events and broadcasts them', async () => {
    queryRealtimeTail.mockResolvedValueOnce([{ ts: new Date().toISOString(), payload: {} }])
    const { app } = makeApp('s4')
    const controller = new AbortController()
    controllers.push(controller)
    const res = await app.request('http://localhost/api/analytics/events', { signal: controller.signal })
    expect(res.status).toBe(200)
    await sleep(2_500)
    expect(queryRealtimeTail).toHaveBeenCalled()
  })

  it('logs a warning when the realtime query fails', async () => {
    queryRealtimeTail.mockRejectedValueOnce(new Error('db down'))
    const { app } = makeApp('s5')
    const controller = new AbortController()
    controllers.push(controller)
    const res = await app.request('http://localhost/api/analytics/events', { signal: controller.signal })
    expect(res.status).toBe(200)
    await sleep(50)
    controller.abort()
  })
})
