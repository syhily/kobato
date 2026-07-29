import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseHandle } from '@/server/infra/db/database'

import { clearAllTables } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'

vi.mock('@/server/infra/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/logger')>()
  return {
    ...actual,
    getLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(function (this: unknown) {
        return this
      }),
    })),
  }
})

vi.mock('@/server/infra/paths', () => ({
  AUDIT_DEAD_LETTER_PATH: '/tmp/audit-dead-letter.log',
}))

import { flushAuditLog, pushAuditEvent, replayDeadLetterAuditLog } from '@/server/domains/audit/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'

let handle: DatabaseHandle

function makeEvent(
  overrides: Partial<Parameters<typeof pushAuditEvent>[0]> = {},
): Parameters<typeof pushAuditEvent>[0] {
  return {
    action: 'post.create',
    actorId: 1,
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

describe('audit batcher', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetAllBatchers()
    handle = getDatabaseHandle()
    await clearAllTables(handle.db)
    // audit_log.actorId FK → user.id: seed the actor.
    handle.db.insert(user).values({ name: 'Admin', email: 'admin@test.dev', password: 'x', role: 'admin' }).run()
    initAllBatchers(handle)
  })

  afterAll(() => {
    resetAllBatchers()
  })

  it('flushes an empty batch immediately', async () => {
    const result = await flushAuditLog()
    expect(result).toEqual({ committed: 0, deadLettered: 0 })
  })

  it('pushes and flushes events into audit_log', async () => {
    pushAuditEvent(makeEvent())
    const result = await flushAuditLog()
    expect(result).toEqual({ committed: 1, deadLettered: 0 })

    const rows = handle.db.select().from(auditLog).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('post.create')
    expect(rows[0]!.actorId).toBe(1)
  })

  it('flushes multiple events as one batch', async () => {
    pushAuditEvent(makeEvent({ action: 'a' }))
    pushAuditEvent(makeEvent({ action: 'b' }))
    const result = await flushAuditLog()
    expect(result).toEqual({ committed: 2, deadLettered: 0 })
    expect(handle.db.select().from(auditLog).all()).toHaveLength(2)
  })

  it('falls back to per-row inserts when the batch fails (bad row dead-letters, good row commits)', async () => {
    // One NOT NULL violation (action) inside the batch: the multi-row
    // insert fails wholesale, the per-row fallback commits the good
    // event and dead-letters the bad one.
    pushAuditEvent(makeEvent({ action: 'good.action' }))
    pushAuditEvent(makeEvent({ action: null as never }))

    const result = await flushAuditLog()

    expect(result.committed).toBe(1)
    expect(result.deadLettered).toBe(1)
    const rows = handle.db.select().from(auditLog).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('good.action')
  })

  it('throws when pushing before initialization', () => {
    resetAllBatchers()
    expect(() => pushAuditEvent(makeEvent())).toThrow('not initialized')
  })

  it('replays dead-letter events (none on disk → no-op)', async () => {
    const result = await replayDeadLetterAuditLog('/nonexistent')
    expect(result.replayed).toBe(0)
  })
})
