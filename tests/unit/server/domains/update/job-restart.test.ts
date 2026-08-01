import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression for audit P0-7: the self-update restart spawned the
// replacement process BEFORE the parent closed its listen socket, so on
// bare metal (no supervisor) the child could bind while the parent still
// held the port, die on EADDRINUSE, and leave the deployment permanently
// down once the parent exited. The default restart must close the socket
// first, then spawn, then request the graceful shutdown.

const calls = vi.hoisted(() => ({ order: [] as string[] }))

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
      return { unref: vi.fn(), pid: 4321 }
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
  })

  it('re-binds the listener instead of shutting down when the respawn fails', async () => {
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
  })
})
