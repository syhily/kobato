import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { getServerPhase, setServerPhase } from '@/server/infra/lifecycle'

describe('/ready endpoint', () => {
  it('returns 200 when phase is running', async () => {
    setServerPhase('running')

    const app = new Hono<Env>()
    app.get('/ready', (c) => {
      const phase = getServerPhase()
      if (phase !== 'running') {
        return c.json({ status: phase }, 503)
      }
      return c.json({ status: 'ok' })
    })

    const res = await app.request('/ready')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  it('returns 503 when phase is restarting', async () => {
    setServerPhase('restarting')

    const app = new Hono<Env>()
    app.get('/ready', (c) => {
      const phase = getServerPhase()
      if (phase !== 'running') {
        return c.json({ status: phase }, 503)
      }
      return c.json({ status: 'ok' })
    })

    const res = await app.request('/ready')
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('restarting')

    // Reset state so subsequent tests are not affected
    setServerPhase('running')
  })

  it('returns 503 when phase is booting', async () => {
    setServerPhase('booting')

    const app = new Hono<Env>()
    app.get('/ready', (c) => {
      const phase = getServerPhase()
      if (phase !== 'running') {
        return c.json({ status: phase }, 503)
      }
      return c.json({ status: 'ok' })
    })

    const res = await app.request('/ready')
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('booting')

    setServerPhase('running')
  })

  it('returns 503 when phase is failed', async () => {
    setServerPhase('failed')

    const app = new Hono<Env>()
    app.get('/ready', (c) => {
      const phase = getServerPhase()
      if (phase !== 'running') {
        return c.json({ status: phase }, 503)
      }
      return c.json({ status: 'ok' })
    })

    const res = await app.request('/ready')
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('failed')

    setServerPhase('running')
  })

  it('is exempt from install-gate middleware', async () => {
    const mockHasAdmin = vi.fn().mockResolvedValue(false)

    vi.doMock('@/server/infra/db/operations/user', () => ({
      hasAdmin: () => mockHasAdmin(),
    }))

    try {
      const { honoInstallGateMiddleware } = await import('@/server/http/middlewares/install-gate')
      const app = new Hono<Env>()
      app.use(honoInstallGateMiddleware)
      app.get('/ready', (c) => c.json({ status: 'ok' }))

      const res = await app.request('/ready')
      expect(res.status).toBe(200)
    } finally {
      vi.doUnmock('@/server/infra/db/operations/user')
    }
  })
})
