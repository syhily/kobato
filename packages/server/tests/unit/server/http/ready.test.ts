import type { Database } from '@kobato/db/database.ts'
import type { Env } from '@kobato/server/http/hono-env.ts'
import type { ServerPhase } from '@kobato/server/infra/lifecycle.ts'

import {
  peekRestoreJobPhase,
  resetRestoreMachine,
  startRestoreJob,
  tryBeginRestore,
  wireRestoreMachine,
  type RestoreMachineDeps,
} from '@kobato/server/domains/backup/restore-machine.ts'
import { readyHandler } from '@kobato/server/http/ready.ts'
import { __getLifecycleContainer, setServerPhase } from '@kobato/server/infra/lifecycle.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    const db = getTestDb()
    await clearAllTables(db)
    const { honoInstallGateMiddleware } = await import('@kobato/server/http/middlewares/install-gate.ts')
    const gated = new Hono<Env>()
    gated.use('*', async (c, next) => {
      c.set('requestContext', {
        url: new URL(c.req.url),
        db,
      } as unknown as Env['Variables']['requestContext'])
      await next()
    })
    gated.use(honoInstallGateMiddleware)
    gated.get('/ready', readyHandler)

    const res = await gated.request('/ready')
    expect(res.status).toBe(200)
  })
})
