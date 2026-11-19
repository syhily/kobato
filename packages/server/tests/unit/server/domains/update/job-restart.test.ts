import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@kobato/server/infra/lifecycle.ts', () => lifecycleMocks)
vi.mock('node:child_process', () => ({ spawn: childProcessMocks.spawn }))
vi.mock('@kobato/server/domains/update/pipeline.ts', () => ({ runSelfUpdate: pipelineMocks.runSelfUpdate }))

async function loadJob() {
  return import('@kobato/server/domains/update/job.ts')
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
          if (event === 'error') {
            childRef.errorListener = listener
          }
        }),
      }
    })
  })

  it('closes the listen socket before spawning the replacement process', async () => {
    const job = await loadJob()
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

    expect(calls.order).toEqual(['close', 'spawn'])
    expect(lifecycleMocks.requestShutdown).not.toHaveBeenCalled()
    expect(job.getUpdateJobStatus()).toMatchObject({
      state: 'failed',
      error: 'spawn ENOENT',
      targetVersion: 'v9.9.9',
    })
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

    await vi.waitFor(
      () => {
        expect(job.getUpdateJobStatus().state).toBe('failed')
      },
      { timeout: 2_000 },
    )

    expect(() => job.startUpdateJob('v9.9.10')).not.toThrow()
  })
})
