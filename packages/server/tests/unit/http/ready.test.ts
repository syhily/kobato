import type { Env } from '@kobato/server/http/context'
import type { Database } from '@kobato/server/infra/db/database'
import type { ServerPhase } from '@kobato/server/infra/lifecycle'

import {
  peekRestoreJobPhase,
  resetRestoreMachine,
  startRestoreJob,
  tryBeginRestore,
  wireRestoreMachine,
  type RestoreMachineDeps,
} from '@kobato/server/domains/backup/restore-machine'
import { readyHandler } from '@kobato/server/http/ready'
import { __getLifecycleContainer, setServerPhase } from '@kobato/server/infra/lifecycle'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The /ready probe against the REAL handler and the REAL state machines:
// the server phase comes from `setServerPhase` transitions (no mock), and
// the restore projection comes from a genuinely wired restore machine.
// Only the machine's engine deps (drain/swap/reopen/complete) are no-op
// test doubles — the phases under assertion are the machine's own.

function resetPhaseTo(phase: ServerPhase): void {
  __getLifecycleContainer().serverPhase = phase
}

function wireNoopMachine(): void {
  const deps: RestoreMachineDeps = {
    drain: () => {},
    prepareForSwap: () => {},
    reopenAfterSwap: async () => ({}) as Database,
    complete: async () => {},
  }
  wireRestoreMachine(deps)
}

function app(): Hono<Env> {
  return new Hono<Env>().get('/ready', readyHandler)
}

describe('/ready endpoint', () => {
  beforeEach(() => {
    resetPhaseTo('booting')
    setServerPhase('running')
    resetRestoreMachine()
  })

  afterEach(() => {
    resetPhaseTo('booting')
    resetRestoreMachine()
  })

  it('returns 200 when phase is running', async () => {
    const res = await app().request('/ready')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  it('returns 503 with the restore projection when phase is restarting', async () => {
    setServerPhase('restarting')
    wireNoopMachine()
    // A real claim leaves the machine in the draining phase.
    expect(tryBeginRestore()).toBe(true)

    const res = await app().request('/ready')
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; restore: { phase: string } }
    expect(body.status).toBe('restarting')
    expect(body.restore.phase).toBe('draining')
  })

  it('returns 503 with failed restore details', async () => {
    setServerPhase('restarting')
    wireNoopMachine()
    expect(tryBeginRestore()).toBe(true)
    // Run the real machine to its failed terminal report.
    startRestoreJob(async () => {
      throw new Error('restore exited with code 1')
    })
    await vi.waitFor(() => {
      expect(peekRestoreJobPhase().phase).toBe('failed')
    })

    const res = await app().request('/ready')
    expect(res.status).toBe(503)
    const body = (await res.json()) as { status: string; restore: { phase: string; error?: string } }
    expect(body.restore.phase).toBe('failed')
    expect(body.restore.error).toBe('restore exited with code 1')
  })

  it('is exempt from install-gate middleware', async () => {
    const mockHasAdmin = vi.fn().mockResolvedValue(false)

    vi.doMock('@kobato/server/infra/db/operations/user', () => ({
      hasAdmin: () => mockHasAdmin(),
    }))

    try {
      const { honoInstallGateMiddleware } = await import('@kobato/server/http/middlewares/install-gate')
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
      vi.doUnmock('@kobato/server/infra/db/operations/user')
    }
  })
})
