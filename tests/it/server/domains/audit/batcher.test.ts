import { Writable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbInsert = vi.fn()
const dbInsertValues = vi.fn(() => ({ values: dbInsert }))

const copyStream = new Writable({
  write(_chunk, _encoding, callback) {
    callback()
  },
})

const poolConnect = vi.fn(() =>
  Promise.resolve({
    query: vi.fn(() => copyStream),
    release: vi.fn(),
  }),
)

const pool = { connect: poolConnect } as any
const db = { insert: dbInsertValues } as any

vi.mock('@/server/infra/db/pool', () => ({
  db,
  pool,
}))

vi.mock('@/server/infra/db/schema', () => ({
  auditLog: { $inferSelect: {}, $inferInsert: {} },
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: vi.fn(),
}))

vi.mock('pg-copy-streams', () => ({
  from: vi.fn(() =>
    vi.fn(() => {
      setTimeout(() => copyStream.emit('finish'), 0)
      return copyStream
    }),
  ),
}))

async function resetBatcher() {
  const mod = await import('@/server/domains/audit/batcher')
  mod.resetAuditLogBatcher()
  mod.initAuditLogBatcher(db, pool)
  return mod
}

describe('audit/batcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('buffers events and flushes when threshold is reached', async () => {
    const { pushAuditEvent, flushAuditLog } = await resetBatcher()

    for (let i = 0; i < 49; i++) {
      pushAuditEvent({ action: 'test', resourceType: 'test' })
    }
    expect(poolConnect).not.toHaveBeenCalled()

    pushAuditEvent({ action: 'test', resourceType: 'test' })
    // The 50th push triggers an async flush; wait for it to complete.
    await flushAuditLog()
    expect(poolConnect).toHaveBeenCalled()
  })

  it('flushes on timer after the first push', async () => {
    const { pushAuditEvent, flushAuditLog } = await resetBatcher()

    pushAuditEvent({ action: 'test', resourceType: 'test' })
    expect(poolConnect).not.toHaveBeenCalled()

    await new Promise((r) => setTimeout(r, 600))
    expect(poolConnect).toHaveBeenCalled()

    await flushAuditLog()
  })

  it('falls back to per-row insert when COPY fails', async () => {
    poolConnect.mockRejectedValueOnce(new Error('pool exhausted'))

    const { pushAuditEvent, flushAuditLog } = await resetBatcher()

    for (let i = 0; i < 50; i++) {
      pushAuditEvent({ action: 'test', resourceType: 'test' })
    }

    await new Promise((r) => setTimeout(r, 50))
    await flushAuditLog()

    expect(poolConnect).toHaveBeenCalled()
    expect(dbInsertValues).toHaveBeenCalled()
  })

  it('preserves createdAt from push time', async () => {
    const { pushAuditEvent, flushAuditLog } = await resetBatcher()
    const before = new Date()

    pushAuditEvent({ action: 'test', resourceType: 'test' })
    await flushAuditLog()

    const after = new Date()
    const batch = dbInsert.mock.calls[0][0]
    expect(batch).toBeInstanceOf(Array)
    expect(batch[0].createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(batch[0].createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})
