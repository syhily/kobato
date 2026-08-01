import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const drainMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const prepareForSwapMock = vi.hoisted(() => vi.fn())
const reopenAfterSwapMock = vi.hoisted(() => vi.fn().mockResolvedValue({ fake: 'db' }))
const completeMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

const machine = await import('@/server/domains/backup/restore-machine')

function wire() {
  machine.wireRestoreMachine({
    drain: drainMock,
    prepareForSwap: prepareForSwapMock,
    reopenAfterSwap: reopenAfterSwapMock,
    complete: completeMock,
  })
}

/**
 * Wait until the fire-and-forget chain finishes. The terminal report
 * (completed/failed) only becomes peekable once the slot is released, so
 * polling the machine's own projection can never race a half-applied
 * state the way a fixed sleep can.
 */
async function settle() {
  await vi.waitFor(() => {
    expect(machine.peekRestoreJobPhase().phase).toMatch(/^(completed|failed)$/)
  })
}

describe('backup/restore-machine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearLogCaptureForTests()
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
    drainMock.mockImplementationOnce(async () => void order.push('drain'))
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

    expect(machine.consumeRestoreJobReport().phase).toBe('completed')
    expect(machine.consumeRestoreJobReport().phase).toBe('idle')
  })

  it('peek never consumes the terminal report — the /ready race', async () => {
    // The aborted-completion path keeps the server in 'restarting'
    // while /ready polls: a liveness read must not eat the failed
    // report the admin endpoint is waiting to show.
    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockRejectedValue(new Error('swap failed')))
    await settle()

    expect(machine.peekRestoreJobPhase().phase).toBe('failed')
    expect(machine.peekRestoreJobPhase().phase).toBe('failed')
    expect(machine.consumeRestoreJobReport().phase).toBe('failed')
    expect(machine.consumeRestoreJobReport().phase).toBe('idle')
  })

  it('marks the job failed when the swap throws and completes with the error', async () => {
    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockRejectedValue(new Error('swap failed')))
    await settle()

    const status = machine.consumeRestoreJobReport()
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

    expect(machine.consumeRestoreJobReport().phase).toBe('failed')
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
    expect(machine.consumeRestoreJobReport().phase).toBe('failed')
    expect(completeMock).toHaveBeenCalledWith(false, expect.any(Error))
  })

  it('runs the failure cleanup when drain throws before the swap', async () => {
    drainMock.mockRejectedValueOnce(new Error('http close failed'))
    const onFailureFn = vi.fn()

    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockResolvedValue(undefined), undefined, onFailureFn)
    await settle()

    expect(onFailureFn).toHaveBeenCalledOnce()
    expect(machine.consumeRestoreJobReport().phase).toBe('failed')
  })

  it('runs the failure cleanup when prepare throws before the swap', async () => {
    prepareForSwapMock.mockImplementationOnce(() => {
      throw new Error('database already closed')
    })
    const onFailureFn = vi.fn()

    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockResolvedValue(undefined), undefined, onFailureFn)
    await settle()

    expect(onFailureFn).toHaveBeenCalledOnce()
    expect(machine.consumeRestoreJobReport().phase).toBe('failed')
  })

  it('skips the failure cleanup once the swap ran — restoreFn owns that cleanup', async () => {
    const onFailureFn = vi.fn()

    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockRejectedValue(new Error('swap failed')), undefined, onFailureFn)
    await settle()

    expect(onFailureFn).not.toHaveBeenCalled()
    expect(machine.consumeRestoreJobReport().phase).toBe('failed')
  })

  it('skips the failure cleanup on success', async () => {
    const onFailureFn = vi.fn()

    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn().mockResolvedValue(undefined), undefined, onFailureFn)
    await settle()

    expect(onFailureFn).not.toHaveBeenCalled()
    expect(machine.consumeRestoreJobReport().phase).toBe('completed')
  })

  it('a throwing failure cleanup never masks the real error', async () => {
    prepareForSwapMock.mockImplementationOnce(() => {
      throw new Error('database already closed')
    })

    expect(machine.tryBeginRestore()).toBe(true)
    machine.startRestoreJob(vi.fn(), undefined, vi.fn().mockRejectedValue(new Error('cleanup failed')))
    await settle()

    const status = machine.consumeRestoreJobReport()
    expect(status.phase).toBe('failed')
    expect(status.error).toBe('database already closed')
  })

  it('ignores startRestoreJob without a claimed slot', () => {
    // No claim → the call is rejected synchronously (the error log fires
    // before startRestoreJob returns), so there is nothing to settle.
    machine.startRestoreJob(vi.fn().mockResolvedValue(undefined))
    expect(__logCaptureForTests()).toContainEqual(
      expect.objectContaining({ level: 'error', msg: 'startRestoreJob without a claimed slot — ignored' }),
    )
    expect(completeMock).not.toHaveBeenCalled()
  })

  describe('withRestoreClaim', () => {
    it('starts the prepared job and reports started', async () => {
      const restoreFn = vi.fn().mockResolvedValue(undefined)
      const outcome = await machine.withRestoreClaim(async () => ({ restoreFn }))
      await settle()

      expect(outcome).toBe('started')
      expect(restoreFn).toHaveBeenCalledOnce()
      expect(machine.consumeRestoreJobReport().phase).toBe('completed')
    })

    it('hands the prepared onFailureFn to the machine', async () => {
      prepareForSwapMock.mockImplementationOnce(() => {
        throw new Error('database already closed')
      })
      const onFailureFn = vi.fn()

      const outcome = await machine.withRestoreClaim(async () => ({
        restoreFn: vi.fn().mockResolvedValue(undefined),
        onFailureFn,
      }))
      await settle()

      expect(outcome).toBe('started')
      expect(onFailureFn).toHaveBeenCalledOnce()
      expect(machine.consumeRestoreJobReport().phase).toBe('failed')
    })

    it('returns busy without running prepare while a job is in flight', async () => {
      expect(machine.tryBeginRestore()).toBe(true)
      const prepare = vi.fn()

      const outcome = await machine.withRestoreClaim(prepare)

      expect(outcome).toBe('busy')
      expect(prepare).not.toHaveBeenCalled()
    })

    it('releases the claim when prepare throws — the slot never leaks', async () => {
      await expect(
        machine.withRestoreClaim(async () => {
          throw new Error('body parse failed')
        }),
      ).rejects.toThrow('body parse failed')

      // The slot is free again.
      expect(machine.tryBeginRestore()).toBe(true)
      machine.abortRestoreClaim()
    })

    it('releases the claim and reports declined when prepare passes on the request', async () => {
      const outcome = await machine.withRestoreClaim(async () => null)

      expect(outcome).toBe('declined')
      expect(machine.tryBeginRestore()).toBe(true)
      machine.abortRestoreClaim()
    })
  })

  it('re-registration replaces the wiring (HMR safety)', async () => {
    const first = vi.fn().mockResolvedValue(undefined)
    const second = vi.fn().mockResolvedValue(undefined)
    machine.wireRestoreMachine({
      drain: drainMock,
      prepareForSwap: prepareForSwapMock,
      reopenAfterSwap: reopenAfterSwapMock,
      complete: first,
    })
    machine.wireRestoreMachine({
      drain: drainMock,
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
