import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { getPhase, setPhase } from '@/server/infra/lifecycle'

describe('/ready endpoint', () => {
  it('returns 200 when phase is running', async () => {
    setPhase('running')

    const app = new Hono<Env>()
    app.get('/ready', (c) => {
      const currentPhase = getPhase()
      if (currentPhase !== 'running') {
        return c.json({ status: currentPhase }, 503)
      }
      return c.json({ status: 'ok' })
    })

    const res = await app.request('/ready')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  it('returns 503 when phase is restarting', async () => {
    setPhase('restarting')

    const app = new Hono<Env>()
    app.get('/ready', (c) => {
      const currentPhase = getPhase()
      if (currentPhase !== 'running') {
        return c.json({ status: currentPhase }, 503)
      }
      return c.json({ status: 'ok' })
    })

    const res = await app.request('/ready')
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('restarting')

    // Reset state so subsequent tests are not affected
    setPhase('running')
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
