import { beforeEach, describe, expect, it, vi } from 'vitest'

const pipelineMocks = vi.hoisted(() => ({ runSelfUpdate: vi.fn() }))
const restartMocks = vi.hoisted(() => ({ scheduleSelfRestart: vi.fn() }))

vi.mock('@/server/domains/update/pipeline', () => ({ runSelfUpdate: pipelineMocks.runSelfUpdate }))
vi.mock('@/server/domains/update/restart', () => ({ scheduleSelfRestart: restartMocks.scheduleSelfRestart }))

// job.ts holds module-level job state; reset the registry and re-import per
// test so each case starts from a clean machine.
async function loadJob() {
  return await import('@/server/domains/update/job')
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
  beforeEach(() => {
    vi.resetModules()
    pipelineMocks.runSelfUpdate.mockReset()
    restartMocks.scheduleSelfRestart.mockReset()
  })

  it('starts idle', async () => {
    const job = await loadJob()
    expect(job.getUpdateJobStatus()).toEqual({ state: 'idle' })
  })

  it('rejects a concurrent apply with CONFLICT', async () => {
    const job = await loadJob()
    const gate = deferred<void>()
    pipelineMocks.runSelfUpdate.mockReturnValue(gate.promise)

    job.startUpdateJob('v9.9.9')
    expect(job.getUpdateJobStatus()).toEqual({ state: 'downloading', targetVersion: 'v9.9.9' })

    // NB: `vi.resetModules()` gives job.ts its own copy of the errors
    // module, so `instanceof` cannot cross the registry boundary here —
    // assert the DomainError shape by its properties instead.
    let caught: unknown
    try {
      job.startUpdateJob('v9.9.9')
    } catch (err) {
      caught = err
    }
    expect(caught).toMatchObject({ name: 'DomainError', code: 'CONFLICT' })

    gate.resolve()
  })

  it('tracks pipeline states and schedules the restart on success without exiting the process', async () => {
    const job = await loadJob()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    try {
      const gate = deferred<void>()
      pipelineMocks.runSelfUpdate.mockImplementation(({ onState }: { onState: (s: string) => void }) => {
        onState('verifying')
        return gate.promise
      })

      job.startUpdateJob('v9.9.9')
      expect(job.getUpdateJobStatus().state).toBe('verifying')

      gate.resolve()
      await vi.waitFor(() => {
        expect(job.getUpdateJobStatus().state).toBe('restarting')
      })
      expect(restartMocks.scheduleSelfRestart).toHaveBeenCalledOnce()
      // The restart seam is fully mocked: process.exit must never fire in tests.
      expect(exitSpy).not.toHaveBeenCalled()
    } finally {
      exitSpy.mockRestore()
    }
  })

  it('marks the job failed on pipeline error and allows a retry', async () => {
    const job = await loadJob()
    const gate = deferred<void>()
    pipelineMocks.runSelfUpdate.mockReturnValue(gate.promise)

    job.startUpdateJob('v9.9.9')
    gate.reject(new Error('更新包校验失败，已中止'))

    await vi.waitFor(() => {
      expect(job.getUpdateJobStatus().state).toBe('failed')
    })
    expect(job.getUpdateJobStatus()).toEqual({
      state: 'failed',
      error: '更新包校验失败，已中止',
      targetVersion: 'v9.9.9',
    })
    expect(restartMocks.scheduleSelfRestart).not.toHaveBeenCalled()

    // A failed job releases the single-job slot.
    const retry = deferred<void>()
    pipelineMocks.runSelfUpdate.mockReturnValue(retry.promise)
    job.startUpdateJob('v9.9.10')
    expect(job.getUpdateJobStatus()).toEqual({ state: 'downloading', targetVersion: 'v9.9.10' })
    retry.resolve()
  })
})
