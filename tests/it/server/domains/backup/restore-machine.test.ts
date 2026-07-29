import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const closeHttpServer = vi.fn().mockResolvedValue(undefined)
const setServerPhase = vi.fn()
const prepareForSwapMock = vi.hoisted(() => vi.fn())
const reopenAfterSwapMock = vi.hoisted(() => vi.fn().mockResolvedValue({ fake: 'db' }))
const completeMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/server/infra/lifecycle', () => ({
  closeHttpServer,
  setServerPhase,
  getServerPhase: vi.fn().mockReturnValue('restarting'),
}))

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => logger),
}))

const machine = await import('@/server/domains/backup/restore-machine')

function wire() {
  machine.wireRestoreMachine({
    prepareForSwap: prepareForSwapMock,
    reopenAfterSwap: reopenAfterSwapMock,
    complete: completeMock,
  })
}

async function settle() {
  await new Promise((r) => setTimeout(r, 50))
}

describe('backup/restore-machine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    machine.resetRestoreMachine()
    wire()
  })

  afterEach(() => {
    machine.resetRestoreMachine()
  })

  it('claims the slot atomically — a second claim fails until the chain finishes', async () => {
    expect(machine.tryBeginRestore()).toBe(true)
    expect(machine.tryBeginRestore()).toBe(false)

    machine.startRestoreJob(vi.fn().mockResolvedValue(undefined))
    await settle()

    // Slot released after the chain; a new job may begin. The terminal
    // report stays behind for one status read.
    expect(machine.tryBeginRestore()).toBe(true)
    machine.abortRestoreClaim()
  })

  it('aborts a claimed-but-never-started slot', () => {
    expect(machine.tryBeginRestore()).toBe(true)
    machine.abortRestoreClaim()
    expect(machine.tryBeginRestore()).toBe(true)
    machine.abortRestoreClaim()
  })

  it('runs the chain in order: drain → prepare → swap → reopen → after → complete', async () => {
    const order: string[] = []
    closeHttpServer.mockImplementationOnce(async () => void order.push('drain'))
    prepareForSwapMock.mockImplementationOnce(() => void order.push('prepare'))
    reopenAfterSwapMock.mockImplementationOnce(async () => {
      order.push('reopen')
      return { fake: 'db' }
    })

    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(
      vi.fn(async () => void order.push('swap')),
      vi.fn(async (db: unknown) => void order.push(`after:${JSON.stringify(db)}`)),
    )
    await settle()

    expect(order).toEqual(['drain', 'prepare', 'swap', 'reopen', 'after:{"fake":"db"}'])
    expect(completeMock).toHaveBeenCalledWith(true, undefined)
  })

  it('reports the terminal state once, then idle', async () => {
    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockResolvedValue(undefined))
    await settle()

    expect(machine.getRestoreJobStatus().phase).toBe('completed')
    expect(machine.getRestoreJobStatus().phase).toBe('idle')
  })

  it('marks the job failed when the swap throws and completes with the error', async () => {
    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockRejectedValue(new Error('swap failed')))
    await settle()

    const status = machine.getRestoreJobStatus()
    expect(status.phase).toBe('failed')
    expect(status.error).toBe('swap failed')
    expect(completeMock).toHaveBeenCalledWith(false, expect.any(Error))
    // The slot still released.
    expect(machine.tryBeginRestore()).toBe(true)
    machine.abortRestoreClaim()
  })

  it('marks the job failed when afterReopenFn throws (the swap already happened)', async () => {
    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockRejectedValue(new Error('no admin found')),
    )
    await settle()

    expect(machine.getRestoreJobStatus().phase).toBe('failed')
    expect(completeMock).toHaveBeenCalledWith(false, expect.any(Error))
  })

  it('aborts the restore when the swap preparation throws', async () => {
    prepareForSwapMock.mockImplementationOnce(() => {
      throw new Error('database already closed')
    })
    const restoreFn = vi.fn().mockResolvedValue(undefined)

    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(restoreFn)
    await settle()

    expect(restoreFn).not.toHaveBeenCalled()
    expect(machine.getRestoreJobStatus().phase).toBe('failed')
    expect(completeMock).toHaveBeenCalledWith(false, expect.any(Error))
  })

  it('ignores startRestoreJob without a claimed slot', async () => {
    machine.startRestoreJob(vi.fn().mockResolvedValue(undefined))
    await settle()
    expect(logger.error).toHaveBeenCalledWith('startRestoreJob without a claimed slot — ignored')
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('re-registration replaces the wiring (HMR safety)', async () => {
    const first = vi.fn().mockResolvedValue(undefined)
    const second = vi.fn().mockResolvedValue(undefined)
    machine.wireRestoreMachine({
      prepareForSwap: prepareForSwapMock,
      reopenAfterSwap: reopenAfterSwapMock,
      complete: first,
    })
    machine.wireRestoreMachine({
      prepareForSwap: prepareForSwapMock,
      reopenAfterSwap: reopenAfterSwapMock,
      complete: second,
    })

    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockResolvedValue(undefined))
    await settle()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(true, undefined)
  })
})
