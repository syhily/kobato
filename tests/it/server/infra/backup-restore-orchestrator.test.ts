import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const closeHttpServer = vi.fn().mockResolvedValue(undefined)
const setServerPhase = vi.fn()
const setRestoreState = vi.fn()
const prepareForSwapMock = vi.hoisted(() => vi.fn())
const reopenAfterSwapMock = vi.hoisted(() => vi.fn().mockResolvedValue({ fake: 'db' }))

vi.mock('@/server/infra/lifecycle', () => ({
  closeHttpServer,
  setServerPhase,
  getServerPhase: vi.fn().mockReturnValue('restarting'),
  setRestoreState,
  getRestoreState: vi.fn().mockReturnValue({ phase: 'idle', startedAt: '' }),
}))

describe('backup/restore-orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    const { resetRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    resetRestoreComplete()
  })

  it('drains HTTP server before restore, then prepares the swap and calls completion on success', async () => {
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    const complete = vi.fn().mockResolvedValue(undefined)
    registerRestoreComplete(complete)

    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ prepareForSwap: prepareForSwapMock, reopenAfterSwap: reopenAfterSwapMock, log }, restoreFn)

    // Drain the microtask queue to let the fire-and-forget IIFE complete
    await new Promise((r) => setTimeout(r, 50))

    expect(setRestoreState).toHaveBeenCalledWith('draining')
    expect(setServerPhase).toHaveBeenCalledWith('restarting')
    expect(closeHttpServer).toHaveBeenCalled()
    expect(restoreFn).toHaveBeenCalled()
    expect(prepareForSwapMock).toHaveBeenCalled()
    expect(setRestoreState).toHaveBeenCalledWith('completed')
    expect(complete).toHaveBeenCalledWith(true, undefined)
  })

  it('calls completion with failure flag on restore error', async () => {
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    const complete = vi.fn().mockResolvedValue(undefined)
    registerRestoreComplete(complete)

    const restoreFn = vi.fn().mockRejectedValue(new Error('psql failed'))
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ prepareForSwap: prepareForSwapMock, reopenAfterSwap: reopenAfterSwapMock, log }, restoreFn)
    await new Promise((r) => setTimeout(r, 50))

    expect(setRestoreState).toHaveBeenCalledWith('failed', 'psql failed')
    expect(complete).toHaveBeenCalledWith(false, expect.any(Error))
  })

  it('logs error when no completion handler is registered', async () => {
    const { performSafeRestore } = await import('@/server/domains/backup/restore-orchestrator')
    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ prepareForSwap: prepareForSwapMock, reopenAfterSwap: reopenAfterSwapMock, log }, restoreFn)
    await new Promise((r) => setTimeout(r, 50))

    expect(log.error).toHaveBeenCalledWith('No restore completion handler registered')
  })

  it('aborts the restore when the swap preparation throws', async () => {
    prepareForSwapMock.mockImplementationOnce(() => {
      throw new Error('database already closed')
    })
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    const complete = vi.fn().mockResolvedValue(undefined)
    registerRestoreComplete(complete)

    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ prepareForSwap: prepareForSwapMock, reopenAfterSwap: reopenAfterSwapMock, log }, restoreFn)
    await new Promise((r) => setTimeout(r, 50))

    // The close guards the file swap — if it fails, the restore must NOT
    // run (swapping under an open handle would corrupt state).
    expect(prepareForSwapMock).toHaveBeenCalled()
    expect(restoreFn).not.toHaveBeenCalled()
    expect(setRestoreState).toHaveBeenCalledWith('failed', 'database already closed')
    expect(complete).toHaveBeenCalledWith(false, expect.any(Error))
  })

  it('handles errors before the try block via the .catch() handler', async () => {
    // Make setRestoreState throw synchronously (before the try block) so the
    // .catch() on the IIFE fires.
    setRestoreState.mockImplementationOnce(() => {
      throw new Error('sync crash')
    })

    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    registerRestoreComplete(vi.fn().mockResolvedValue(undefined))

    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ prepareForSwap: prepareForSwapMock, reopenAfterSwap: reopenAfterSwapMock, log }, restoreFn)
    await new Promise((r) => setTimeout(r, 50))

    // The .catch() handler should have logged the crash
    expect(log.error).toHaveBeenCalledWith(
      'Restore orchestrator crashed',
      expect.objectContaining({ err: 'sync crash' }),
    )
  })

  it('runs afterReopenFn against the freshly reopened database, after the swap', async () => {
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    registerRestoreComplete(vi.fn().mockResolvedValue(undefined))

    const order: string[] = []
    const restoreFn = vi.fn(async () => {
      order.push('swap')
    })
    reopenAfterSwapMock.mockImplementationOnce(async () => {
      order.push('reopen')
      return { fake: 'db' }
    })
    const afterReopenFn = vi.fn(async (db: unknown) => {
      order.push(`after:${JSON.stringify(db)}`)
    })
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore(
      { prepareForSwap: prepareForSwapMock, reopenAfterSwap: reopenAfterSwapMock, log },
      restoreFn,
      afterReopenFn,
    )
    await new Promise((r) => setTimeout(r, 50))

    expect(order).toEqual(['swap', 'reopen', 'after:{"fake":"db"}'])
    expect(setRestoreState).toHaveBeenCalledWith('completed')
  })

  it('marks the restore failed when afterReopenFn throws (the swap already happened)', async () => {
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    const complete = vi.fn().mockResolvedValue(undefined)
    registerRestoreComplete(complete)

    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const afterReopenFn = vi.fn().mockRejectedValue(new Error('no admin found'))
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore(
      { prepareForSwap: prepareForSwapMock, reopenAfterSwap: reopenAfterSwapMock, log },
      restoreFn,
      afterReopenFn,
    )
    await new Promise((r) => setTimeout(r, 50))

    expect(setRestoreState).toHaveBeenCalledWith('failed', 'no admin found')
    expect(complete).toHaveBeenCalledWith(false, expect.any(Error))
  })

  it('allows re-registering the completion handler for HMR safety', async () => {
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    const first = vi.fn().mockResolvedValue(undefined)
    const second = vi.fn().mockResolvedValue(undefined)

    registerRestoreComplete(first)
    registerRestoreComplete(second)

    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ prepareForSwap: prepareForSwapMock, reopenAfterSwap: reopenAfterSwapMock, log }, restoreFn)
    await new Promise((r) => setTimeout(r, 50))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(true, undefined)
  })
})
