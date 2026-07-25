import { beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn,
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

import {
  flushAllBatchers,
  getBatcher,
  initAllBatchers,
  registerBatcher,
  requireBatcher,
  resetAllBatchers,
} from '@/server/infra/db/batcher-registry'

const pool = {} as never
const db = {} as never

function fakeBatcher() {
  return { flush: vi.fn(async () => ({ committed: 0, deadLettered: 0 })) }
}

// Registrations accumulate for the whole file (there is no unregister —
// production registers once per module at import time), so every test
// uses its own batcher names. `resetAllBatchers` in beforeEach drops any
// live instances left over from the previous test.
describe('server/infra/db/batcher-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAllBatchers()
  })

  it('initAllBatchers constructs every registered batcher with (pool, db)', () => {
    const batcher = fakeBatcher()
    const init = vi.fn(() => batcher)
    registerBatcher('test-init', init)

    initAllBatchers(pool, db)

    expect(init).toHaveBeenCalledWith(pool, db)
    expect(getBatcher('test-init')).toBe(batcher)
  })

  it('getBatcher returns undefined and requireBatcher throws before initialization', () => {
    registerBatcher('test-uninitialized', () => fakeBatcher())

    expect(getBatcher('test-uninitialized')).toBeUndefined()
    expect(() => requireBatcher('test-uninitialized')).toThrow(
      'test-uninitialized not initialized — call initAllBatchers(pool, db) first',
    )
  })

  it('re-registering a name replaces the factory and drops the live instance', () => {
    const first = fakeBatcher()
    const second = fakeBatcher()
    registerBatcher('test-reregister', () => first)
    initAllBatchers(pool, db)
    expect(requireBatcher('test-reregister')).toBe(first)

    registerBatcher('test-reregister', () => second)
    // The old instance is dropped until the next initAllBatchers.
    expect(getBatcher('test-reregister')).toBeUndefined()

    initAllBatchers(pool, db)
    expect(requireBatcher('test-reregister')).toBe(second)
  })

  it('flushAllBatchers flushes in registration order', async () => {
    const first = fakeBatcher()
    const second = fakeBatcher()
    registerBatcher('test-order-1', () => first)
    registerBatcher('test-order-2', () => second)
    initAllBatchers(pool, db)

    await flushAllBatchers()

    expect(first.flush).toHaveBeenCalledOnce()
    expect(second.flush).toHaveBeenCalledOnce()
    expect(first.flush.mock.invocationCallOrder[0]!).toBeLessThan(second.flush.mock.invocationCallOrder[0]!)
  })

  it('flushAllBatchers isolates failures and never rejects', async () => {
    const failing = { flush: vi.fn(async (): Promise<unknown> => Promise.reject(new Error('flush exploded'))) }
    const healthy = fakeBatcher()
    registerBatcher('test-fail', () => failing)
    registerBatcher('test-healthy', () => healthy)
    initAllBatchers(pool, db)

    await expect(flushAllBatchers()).resolves.toBeUndefined()

    expect(healthy.flush).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith('batcher flush failed; continuing with the rest', {
      batcher: 'test-fail',
      err: 'flush exploded',
    })
  })

  it('flushAllBatchers skips batchers that are not initialized', async () => {
    const batcher = fakeBatcher()
    registerBatcher('test-skip', () => batcher)

    await flushAllBatchers()

    expect(batcher.flush).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('resetAllBatchers drops instances but keeps registrations', () => {
    const batcher = fakeBatcher()
    const init = vi.fn(() => batcher)
    registerBatcher('test-reset', init)
    initAllBatchers(pool, db)
    expect(requireBatcher('test-reset')).toBe(batcher)

    resetAllBatchers()
    expect(() => requireBatcher('test-reset')).toThrow('test-reset not initialized')

    // Re-init works without re-registering.
    initAllBatchers(pool, db)
    expect(init).toHaveBeenCalledTimes(2)
    expect(requireBatcher('test-reset')).toBe(batcher)
  })
})
