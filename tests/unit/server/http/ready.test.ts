import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

const mocks = vi.hoisted(() => ({
  getServerPhase: vi.fn(),
  peekRestoreJobPhase: vi.fn(),
}))
const { getServerPhase, peekRestoreJobPhase } = mocks

vi.mock('@/server/infra/lifecycle', () => ({
  getServerPhase: mocks.getServerPhase,
}))

vi.mock('@/server/domains/backup/restore-machine', () => ({
  peekRestoreJobPhase: mocks.peekRestoreJobPhase,
}))

import { readyHandler } from '@/server/http/ready'

// The /ready probe against the REAL handler (extracted to
// '@/server/http/ready' — these tests used to pin inline copies of it).
function app(): Hono<Env> {
  return new Hono<Env>().get('/ready', readyHandler)
}

describe('/ready endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerPhase.mockReturnValue('running')
    peekRestoreJobPhase.mockReturnValue({ phase: 'idle', startedAt: '' })
  })

  it('returns 200 when phase is running', async () => {
    const res = await app().request('/ready')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  it('returns 503 with the restore projection when phase is restarting', async () => {
    getServerPhase.mockReturnValue('restarting')
    peekRestoreJobPhase.mockReturnValue({ phase: 'draining', startedAt: '2026-01-01T00:00:00.000Z' })

    const res = await app().request('/ready')
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; restore: { phase: string } }
    expect(body.status).toBe('restarting')
    expect(body.restore.phase).toBe('draining')
  })

  it('returns 503 with failed restore details', async () => {
    getServerPhase.mockReturnValue('restarting')
    peekRestoreJobPhase.mockReturnValue({
      phase: 'failed',
      startedAt: '2026-01-01T00:00:00.000Z',
      error: 'restore exited with code 1',
    })

    const res = await app().request('/ready')
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; restore: { phase: string; error?: string } }
    expect(body.restore.phase).toBe('failed')
    expect(body.restore.error).toBe('restore exited with code 1')
  })

  it('is exempt from install-gate middleware', async () => {
    const mockHasAdmin = vi.fn().mockResolvedValue(false)

    vi.doMock('@/server/infra/db/operations/user', () => ({
      hasAdmin: () => mockHasAdmin(),
    }))

    try {
      const { honoInstallGateMiddleware } = await import('@/server/http/middlewares/install-gate')
      const gated = new Hono<Env>()
      // Stub the canonical per-request context — the gate reads
      // `requestContext.url` and `requestContext.db`.
      gated.use('*', async (c, next) => {
        c.set('requestContext', {
          url: new URL(c.req.url),
          db: {},
        } as unknown as Env['Variables']['requestContext'])
        await next()
      })
      gated.use(honoInstallGateMiddleware)
      gated.get('/ready', readyHandler)

      const res = await gated.request('/ready')
      expect(res.status).toBe(200)
    } finally {
      vi.doUnmock('@/server/infra/db/operations/user')
    }
  })
})
