import { beforeEach, describe, expect, it, vi } from 'vitest'

const pipelineMocks = vi.hoisted(() => ({ runSelfUpdate: vi.fn() }))

vi.mock('@kobato/server/domains/update/pipeline', () => ({ runSelfUpdate: pipelineMocks.runSelfUpdate }))

async function loadJob() {
  return import('@kobato/server/domains/update/job')
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

    const retry = deferred<undefined>()
    pipelineMocks.runSelfUpdate.mockReturnValue(retry.promise)
    job.startUpdateJob('v9.9.10', { restart })
    expect(job.getUpdateJobStatus()).toEqual({ state: 'downloading', targetVersion: 'v9.9.10' })
    retry.resolve(undefined)
  })

  it('localizes a pipeline descriptor on the failed status per request locale', async () => {
    const job = await loadJob()
    const { descriptorFor } = await import('@kobato/server/infra/http/error-descriptor')
    const { DomainError } = await import('@kobato/server/infra/http/errors')
    const gate = deferred<undefined>()
    pipelineMocks.runSelfUpdate.mockReturnValue(gate.promise)

    job.startUpdateJob('v9.9.9', { restart })
    gate.reject(new DomainError('INTERNAL', descriptorFor('update.error.archiveHashMismatch')))

    await vi.waitFor(() => {
      expect(job.getUpdateJobStatus().state).toBe('failed')
    })

    expect(job.getUpdateJobStatus().error).toBe('更新包校验失败，已中止')
    expect(job.getUpdateJobStatus('en-US').error).toBe(
      'The update package checksum did not match; the update was aborted',
    )
    expect(job.getUpdateJobStatus('zh-TW').error).toBe('更新套件校驗失敗，已中止')
    expect(job.getUpdateJobStatus('en-US').error).not.toContain('update.error.')

    const retry = deferred<undefined>()
    pipelineMocks.runSelfUpdate.mockReturnValue(retry.promise)
    job.startUpdateJob('v9.9.10', { restart })
    expect(job.getUpdateJobStatus()).toEqual({ state: 'downloading', targetVersion: 'v9.9.10' })
    retry.resolve(undefined)
  })
})
