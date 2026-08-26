import { describe, expect, it, vi } from 'vitest'

import type { Logger } from '@/server/infra/logger'

import { runDueRows } from '@/server/domains/webmentions/queue-scheduler'

// The per-row error-isolation invariant shared by the outbox / inbox /
// reverify batches, pinned directly (the integration tests observe it only
// through end results).

function stubLog(): Logger {
  return { warn: vi.fn() } as unknown as Logger
}

describe('runDueRows', () => {
  it('handles every picked row in order and returns the picked count', async () => {
    const handled: number[] = []
    const log = stubLog()
    const processed = await runDueRows({
      pick: () => Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }]),
      handleRow: (row) => {
        handled.push(row.id)
        return Promise.resolve()
      },
      log,
      rowThrewMessage: 'row threw',
    })

    expect(handled).toEqual([1, 2, 3])
    expect(processed).toBe(3)
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('isolates a throwing row: later rows still run, count still returned', async () => {
    const handled: number[] = []
    const log = stubLog()
    const processed = await runDueRows<{ id: number }>({
      pick: () => Promise.resolve([{ id: 1 }, { id: 2 }, { id: 3 }]),
      handleRow: (row) => {
        if (row.id === 2) {
          return Promise.reject(new Error('boom'))
        }
        handled.push(row.id)
        return Promise.resolve()
      },
      log,
      rowThrewMessage: 'Webmention test row processing threw',
    })

    expect(handled).toEqual([1, 3])
    expect(processed).toBe(3)
    expect(log.warn).toHaveBeenCalledWith('Webmention test row processing threw', { id: 2, error: 'Error: boom' })
  })

  it('runs onRowError with the row and error after the warn line', async () => {
    const order: string[] = []
    const log = stubLog()
    log.warn = vi.fn(() => order.push('warn'))
    const onRowError = vi.fn(async (row: { id: number }) => {
      order.push(`recover:${row.id}`)
    })

    await runDueRows({
      pick: () => Promise.resolve([{ id: 7 }, { id: 8 }]),
      handleRow: (row) => Promise.reject(new Error(`nope ${row.id}`)),
      log,
      rowThrewMessage: 'row threw',
      onRowError,
    })

    expect(order).toEqual(['warn', 'recover:7', 'warn', 'recover:8'])
    expect(onRowError).toHaveBeenCalledTimes(2)
    expect(onRowError).toHaveBeenNthCalledWith(1, { id: 7 }, new Error('nope 7'))
    expect(onRowError).toHaveBeenNthCalledWith(2, { id: 8 }, new Error('nope 8'))
  })

  it('does not isolate a failing pick — a picker throw kills the batch', async () => {
    const handleRow = vi.fn()

    await expect(
      runDueRows({
        pick: () => Promise.reject(new Error('db down')),
        handleRow,
        log: stubLog(),
        rowThrewMessage: 'row threw',
      }),
    ).rejects.toThrow('db down')
    expect(handleRow).not.toHaveBeenCalled()
  })
})
