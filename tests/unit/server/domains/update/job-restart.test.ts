import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression for audit P0-7: the self-update restart spawned the
// replacement process BEFORE the parent closed its listen socket, so on
// bare metal (no supervisor) the child could bind while the parent still
// held the port, die on EADDRINUSE, and leave the deployment permanently
// down once the parent exited. The default restart must close the socket
// first, then spawn, then request the graceful shutdown.
//
// Audit V3-01: real spawn failures (ENOENT/EACCES) arrive asynchronously
// via the child's 'error' event, not a synchronous throw. The restart must
// listen for that event, restore the listener, land the job in 'failed',
// and release the slot so later applies stop 409ing.

const calls = vi.hoisted(() => ({ order: [] as string[] }))

const childRef = vi.hoisted(() => ({
  errorListener: undefined as ((err: Error) => void) | undefined,
}))

const lifecycleMocks = vi.hoisted(() => ({
  closeHttpServer: vi.fn(),
  requestShutdown: vi.fn(),
  restartServer: vi.fn(),
}))

const childProcessMocks = vi.hoisted(() => ({ spawn: vi.fn() }))

const pipelineMocks = vi.hoisted(() => ({ runSelfUpdate: vi.fn() }))

vi.mock('@/server/infra/lifecycle', () => lifecycleMocks)
vi.mock('node:child_process', () => ({ spawn: childProcessMocks.spawn }))
vi.mock('@/server/domains/update/pipeline', () => ({ runSelfUpdate: pipelineMocks.runSelfUpdate }))

async function loadJob() {
  return import('@/server/domains/update/job')
}

describe('update/job scheduleSelfRestart (default restart)', () => {
  beforeEach(() => {
    vi.resetModules()
    calls.order.length = 0
    childRef.errorListener = undefined
    pipelineMocks.runSelfUpdate.mockReset().mockResolvedValue(undefined)
    lifecycleMocks.closeHttpServer.mockReset().mockImplementation(async () => {
      calls.order.push('close')
    })
    lifecycleMocks.requestShutdown.mockReset().mockImplementation(() => {
      calls.order.push('shutdown')
    })
    lifecycleMocks.restartServer.mockReset().mockResolvedValue(undefined)
    childProcessMocks.spawn.mockReset().mockImplementation(() => {
      calls.order.push('spawn')
      return {
        unref: vi.fn(),
        pid: 4321,
        on: vi.fn((event: string, listener: (err: Error) => void) => {
          if (event === 'error') {childRef.errorListener = listener}
        }),
      }
    })
  })

  it('closes the listen socket before spawning the replacement process', async () => {
    const job = await loadJob()
    // No injected restart — the real `scheduleSelfRestart` drives the
    // mocked lifecycle/spawn seams. `process.exit` never runs: the mocked
    // `requestShutdown` swallows the shutdown.
    job.startUpdateJob('v9.9.9')

    await vi.waitFor(
      () => {
        expect(lifecycleMocks.requestShutdown).toHaveBeenCalledOnce()
      },
      { timeout: 2_000 },
    )

    expect(calls.order).toEqual(['close', 'spawn', 'shutdown'])
    expect(childProcessMocks.spawn).toHaveBeenCalledWith(process.execPath, process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    })
    // The happy path must still arm the async failure listener; without it
    // a later 'error' event would crash the process as an uncaught throw.
    expect(childRef.errorListener).toBeDefined()
  })

  it('recovers when the spawned child emits an async error', async () => {
    const job = await loadJob()
    job.startUpdateJob('v9.9.9')

    await vi.waitFor(
      () => {
        expect(childRef.errorListener).toBeDefined()
      },
      { timeout: 2_000 },
    )

    // ENOENT/EACCES surface like this in production — the spawn call
    // succeeded, the failure arrives on the child afterwards.
    childRef.errorListener!(new Error('spawn ENOENT'))

    await vi.waitFor(
      () => {
        expect(job.getUpdateJobStatus().state).toBe('failed')
      },
      { timeout: 2_000 },
    )

    expect(lifecycleMocks.restartServer).toHaveBeenCalledOnce()
    expect(job.getUpdateJobStatus()).toMatchObject({
      state: 'failed',
      error: 'spawn ENOENT',
      targetVersion: 'v9.9.9',
    })
    // The slot is released: a follow-up apply must not 409.
    expect(() => job.startUpdateJob('v9.9.10')).not.toThrow()
  })

  it('re-binds the listener and marks the job failed when spawn throws synchronously', async () => {
    const job = await loadJob()
    childProcessMocks.spawn.mockImplementation(() => {
      calls.order.push('spawn')
      throw new Error('spawn ENOENT')
    })

    job.startUpdateJob('v9.9.9')

    await vi.waitFor(
      () => {
        expect(lifecycleMocks.restartServer).toHaveBeenCalledOnce()
      },
      { timeout: 2_000 },
    )

    // The socket was closed before the failed spawn; the process must
    // recover its listener and stay up rather than exiting into a dead
    // deployment.
    expect(calls.order).toEqual(['close', 'spawn'])
    expect(lifecycleMocks.requestShutdown).not.toHaveBeenCalled()
    expect(job.getUpdateJobStatus()).toMatchObject({
      state: 'failed',
      error: 'spawn ENOENT',
      targetVersion: 'v9.9.9',
    })
    // The slot is released: a follow-up apply must not 409.
    expect(() => job.startUpdateJob('v9.9.10')).not.toThrow()
  })

  it('still marks the job failed when restoring the listener itself fails', async () => {
    const job = await loadJob()
    childProcessMocks.spawn.mockImplementation(() => {
      calls.order.push('spawn')
      throw new Error('spawn ENOENT')
    })
    lifecycleMocks.restartServer.mockRejectedValue(new Error('bind EADDRINUSE'))

    job.startUpdateJob('v9.9.9')

    // A rejecting `restartServer` must be caught — an unhandled rejection
    // here would fail this run — and the job must still land in 'failed'.
    await vi.waitFor(
      () => {
        expect(job.getUpdateJobStatus().state).toBe('failed')
      },
      { timeout: 2_000 },
    )

    expect(() => job.startUpdateJob('v9.9.10')).not.toThrow()
  })
})
