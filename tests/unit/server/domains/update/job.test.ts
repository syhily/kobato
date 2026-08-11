import { beforeEach, describe, expect, it, vi } from 'vitest'

const pipelineMocks = vi.hoisted(() => ({ runSelfUpdate: vi.fn() }))

vi.mock('@/server/domains/update/pipeline', () => ({ runSelfUpdate: pipelineMocks.runSelfUpdate }))

// job.ts holds module-level job state; reset the registry and re-import per
// test so each case starts from a clean machine.
async function loadJob() {
  return import('@/server/domains/update/job')
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('update/job startUpdateJob', () => {
  // The restart is injected (see `StartUpdateJobOptions.restart`): a plain
  // spy replaces the detached-respawn + `process.exit` seam, which must
  // never fire inside a vitest worker.
  const restart = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    pipelineMocks.runSelfUpdate.mockReset()
    restart.mockReset()
  })

  it('starts idle', async () => {
    const job = await loadJob()
    expect(job.getUpdateJobStatus()).toEqual({ state: 'idle' })
  })

  it('rejects a concurrent apply with CONFLICT', async () => {
    const job = await loadJob()
    const gate = deferred<undefined>()
    pipelineMocks.runSelfUpdate.mockReturnValue(gate.promise)

    job.startUpdateJob('v9.9.9', { restart })
    expect(job.getUpdateJobStatus()).toEqual({ state: 'downloading', targetVersion: 'v9.9.9' })

    // NB: `vi.resetModules()` gives job.ts its own copy of the errors
    // module, so `instanceof` cannot cross the registry boundary here —
    // assert the DomainError shape by its properties instead.
    let caught: unknown
    try {
      job.startUpdateJob('v9.9.9', { restart })
    } catch (err) {
      caught = err
    }
    expect(caught).toMatchObject({ name: 'DomainError', code: 'CONFLICT' })

    gate.resolve(undefined)
  })

  it('tracks pipeline states and schedules the restart on success', async () => {
    const job = await loadJob()
    const gate = deferred<undefined>()
    pipelineMocks.runSelfUpdate.mockImplementation(({ onState }: { onState: (s: string) => void }) => {
      onState('verifying')
      return gate.promise
    })

    job.startUpdateJob('v9.9.9', { restart })
    expect(job.getUpdateJobStatus().state).toBe('verifying')

    gate.resolve(undefined)
    await vi.waitFor(() => {
      expect(job.getUpdateJobStatus().state).toBe('restarting')
    })
    // Called exactly once, on success only.
    expect(restart).toHaveBeenCalledOnce()
  })

  it('marks the job failed on pipeline error and allows a retry', async () => {
    const job = await loadJob()
    const gate = deferred<undefined>()
    pipelineMocks.runSelfUpdate.mockReturnValue(gate.promise)

    job.startUpdateJob('v9.9.9', { restart })
    gate.reject(new Error('更新包校验失败，已中止'))

    await vi.waitFor(() => {
      expect(job.getUpdateJobStatus().state).toBe('failed')
    })
    expect(job.getUpdateJobStatus()).toEqual({
      state: 'failed',
      error: '更新包校验失败，已中止',
      targetVersion: 'v9.9.9',
    })
    expect(restart).not.toHaveBeenCalled()

    // A failed job releases the single-job slot.
    const retry = deferred<undefined>()
    pipelineMocks.runSelfUpdate.mockReturnValue(retry.promise)
    job.startUpdateJob('v9.9.10', { restart })
    expect(job.getUpdateJobStatus()).toEqual({ state: 'downloading', targetVersion: 'v9.9.10' })
    retry.resolve(undefined)
  })
})
