import { Writable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const poolMock = {
  connect: vi.fn(),
}

let insertResult: Promise<unknown> = Promise.resolve(undefined)
const valuesFn = vi.fn(() => insertResult)

const dbMock = {
  insert: vi.fn(() => ({ values: valuesFn })),
}

vi.mock('@/server/infra/db/copy-batcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/db/copy-batcher')>()
  return {
    ...actual,
    CopyBatcher: actual.CopyBatcher,
  }
})

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(function (this: unknown) {
      return this
    }),
  })),
}))

vi.mock('@/server/infra/paths', () => ({
  AUDIT_DEAD_LETTER_PATH: '/tmp/audit-dead-letter.log',
}))

import { flushAuditLog, pushAuditEvent, replayDeadLetterAuditLog } from '@/server/domains/audit/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'

function makeEvent(
  overrides: Partial<Parameters<typeof pushAuditEvent>[0]> = {},
): Parameters<typeof pushAuditEvent>[0] {
  return {
    action: 'post.create',
    actorId: 1n,
    actorRole: 'admin',
    resourceType: 'post',
    resourceId: '2',
    details: { foo: 'bar' },
    ipAddress: '127.0.0.1',
    userAgent: 'ua',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function mockPoolForCopy() {
  const writable = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  const client = {
    query: vi.fn(() => writable),
    release: vi.fn(),
  }
  poolMock.connect.mockResolvedValue(client)
}

function mockPoolForFailure() {
  const client = {
    query: vi.fn(() => {
      const stream = new Writable({
        write(_chunk, _encoding, callback) {
          callback(new Error('copy failed'))
        },
      })
      return stream
    }),
    release: vi.fn(),
  }
  poolMock.connect.mockResolvedValue(client)
}

describe('audit batcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAllBatchers()
    insertResult = Promise.resolve(undefined)
  })

  it('flushes an empty batch immediately', async () => {
    initAllBatchers(poolMock as never, dbMock as never)
    const result = await flushAuditLog()
    expect(result).toEqual({ committed: 0, deadLettered: 0 })
  })

  it('pushes and flushes events via COPY', async () => {
    mockPoolForCopy()
    initAllBatchers(poolMock as never, dbMock as never)
    pushAuditEvent(makeEvent())
    const result = await flushAuditLog()
    expect(result.committed).toBe(1)
    expect(result.deadLettered).toBe(0)
  })

  it('falls back to batch insert when COPY fails', async () => {
    mockPoolForFailure()
    initAllBatchers(poolMock as never, dbMock as never)
    pushAuditEvent(makeEvent())
    const result = await flushAuditLog()
    expect(result.committed).toBe(1)
    expect(valuesFn).toHaveBeenCalled()
  })

  it('falls back to per-row insert when batch insert fails', async () => {
    mockPoolForFailure()
    insertResult = Promise.reject(new Error('batch insert failed'))
    initAllBatchers(poolMock as never, dbMock as never)
    pushAuditEvent(makeEvent())
    const result = await flushAuditLog()
    expect(result.committed).toBe(0)
    expect(result.deadLettered).toBe(1)
  })

  it('throws when pushing before initialization', () => {
    resetAllBatchers()
    expect(() => pushAuditEvent(makeEvent())).toThrow('not initialized')
  })

  it('replays dead-letter events', async () => {
    mockPoolForCopy()
    initAllBatchers(poolMock as never, dbMock as never)
    const result = await replayDeadLetterAuditLog('/nonexistent')
    expect(result.replayed).toBe(0)
  })
})
