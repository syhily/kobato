import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const closeHttpServer = vi.fn().mockResolvedValue(undefined)
const setPhase = vi.fn()
const setRestoreResult = vi.fn()
const closePool = vi.fn().mockResolvedValue(undefined)

vi.mock('@/server/infra/lifecycle', () => ({
  closeHttpServer,
  setPhase,
  getPhase: vi.fn().mockReturnValue('restarting'),
  setRestoreResult,
  getRestoreResult: vi.fn().mockReturnValue({ phase: 'idle', startedAt: '' }),
}))

vi.mock('@/server/infra/db/pool', () => ({
  closePool,
}))

describe('backup/restore-orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    const { resetRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    resetRestoreComplete()
  })

  it('drains HTTP server before restore, then closes pool and calls completion on success', async () => {
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    const complete = vi.fn().mockResolvedValue(undefined)
    registerRestoreComplete(complete)

    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ pool: {} as any, log }, restoreFn)

    // Yield to event loop so the background task starts
    await new Promise((r) => setTimeout(r, 10))

    expect(setRestoreResult).toHaveBeenCalledWith('draining')
    expect(setPhase).toHaveBeenCalledWith('restarting')
    expect(closeHttpServer).toHaveBeenCalled()
    expect(restoreFn).toHaveBeenCalled()
    // Pool is closed AFTER restoreFn so post-restore DB queries work
    expect(closePool).toHaveBeenCalled()
    expect(setRestoreResult).toHaveBeenCalledWith('completed')
    expect(complete).toHaveBeenCalledWith(true, undefined)
  })

  it('calls completion with failure flag on restore error', async () => {
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    const complete = vi.fn().mockResolvedValue(undefined)
    registerRestoreComplete(complete)

    const restoreFn = vi.fn().mockRejectedValue(new Error('psql failed'))
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ pool: {} as any, log }, restoreFn)
    await new Promise((r) => setTimeout(r, 10))

    expect(setRestoreResult).toHaveBeenCalledWith('failed', 'psql failed')
    expect(complete).toHaveBeenCalledWith(false, expect.any(Error))
  })

  it('logs error when no completion handler is registered', async () => {
    const { performSafeRestore } = await import('@/server/domains/backup/restore-orchestrator')
    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ pool: {} as any, log }, restoreFn)
    await new Promise((r) => setTimeout(r, 10))

    expect(log.error).toHaveBeenCalledWith('No restore completion handler registered')
  })

  it('continues to completion even if pool close throws', async () => {
    closePool.mockRejectedValueOnce(new Error('pool already closed'))
    const { performSafeRestore, registerRestoreComplete } = await import('@/server/domains/backup/restore-orchestrator')
    const complete = vi.fn().mockResolvedValue(undefined)
    registerRestoreComplete(complete)

    const restoreFn = vi.fn().mockResolvedValue(undefined)
    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as any

    performSafeRestore({ pool: {} as any, log }, restoreFn)
    await new Promise((r) => setTimeout(r, 10))

    expect(closePool).toHaveBeenCalled()
    expect(restoreFn).toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith(true, undefined)
  })
})
