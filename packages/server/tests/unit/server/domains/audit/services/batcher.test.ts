import type { DatabaseHandle } from '@kobato/db/database.ts'

import { auditLog } from '@kobato/db/schema/config.ts'
import { user } from '@kobato/db/schema/user.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import {
  flushAuditLog,
  pushAuditEvent,
  replayDeadLetterAuditLog,
} from '@kobato/server/domains/audit/services/batcher.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { clearAllTables } from '@kobato/test/integration-db.ts'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
